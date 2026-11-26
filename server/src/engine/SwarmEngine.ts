import { randomUUID } from 'node:crypto';
import type {
  Agent,
  AgentRole,
  ApprovalRequest,
  BoardPost,
  ClientEvent,
  FileEditIndicator,
  ServerEvent,
} from '../../../shared/types';
import type { LLMProvider } from '../llm/LLMProvider';

/**
 * SwarmEngine — orquestrador do enxame.
 *
 * Modelo de comunicação: pub/sub orientado a menções. Toda mensagem publicada
 * no Board é varrida por `@id`; cada agente mencionado que está em `waiting`
 * é acordado (`active`), roda um turno no LLM e volta a dormir. Agentes em
 * `waiting` não gastam tokens — só o que é explicitamente mencionado acorda.
 *
 * A profundidade de recursão é limitada (MAX_DEPTH) para que um agente não
 * acorde o enxame inteiro em cascata infinita.
 */
const MAX_DEPTH = 6;
const MAX_HISTORY = 500;
const MONITOR_INTERVAL_MS = 5_000;
const MONITOR_STALE_MS = 30_000;

interface PendingApproval {
  request: ApprovalRequest;
  resolve: (approved: boolean) => void;
}

export class SwarmEngine {
  private agents = new Map<string, Agent>();
  private posts: BoardPost[] = [];
  private pendingApprovals = new Map<string, PendingApproval>();
  private listeners = new Set<(evt: ServerEvent) => void>();
  private monitorTimer: NodeJS.Timeout | null = null;
  private lastActivityAt = Date.now();
  private openTask: string | null = null;
  private taskDone = true;

  constructor(private llm: LLMProvider) {}

  // -------------------------------------------------------------------------
  // Eventos / transporte
  // -------------------------------------------------------------------------

  onEvent(cb: (evt: ServerEvent) => void): void {
    this.listeners.add(cb);
  }

  private emit(evt: ServerEvent): void {
    for (const cb of this.listeners) cb(evt);
  }

  getAgents(): Agent[] {
    return [...this.agents.values()];
  }

  getHistory(): BoardPost[] {
    return [...this.posts];
  }

  private broadcastAgents(): void {
    this.emit({ type: 'agents', agents: this.getAgents() });
  }

  // -------------------------------------------------------------------------
  // Registro de agentes
  // -------------------------------------------------------------------------

  registerAgent(def: { id: string; role: AgentRole; model: string; task: string }): Agent {
    const agent: Agent = {
      id: def.id,
      name: `@${def.id}`,
      role: def.role,
      model: def.model,
      status: 'waiting',
      task: def.task,
      lastSeen: Date.now(),
    };
    this.agents.set(agent.id, agent);
    this.broadcastAgents();
    return agent;
  }

  /** Agentes padrão do MVP. */
  registerDefaultAgents(): void {
    const model = process.env.SWARM_MODEL ?? 'gpt-4o-mini';
    this.registerAgent({ id: 'coordinator', role: 'coordinator', model, task: 'Definir briefing e dividir subtarefas' });
    this.registerAgent({ id: 'ui-worker', role: 'worker', model, task: 'Edição de UI / frontend' });
    this.registerAgent({ id: 'api-worker', role: 'worker', model, task: 'Edição de backend / orquestrador' });
    this.registerAgent({ id: 'verifier', role: 'verifier', model, task: 'Validar diffs e concluir a tarefa' });
    this.registerAgent({ id: 'monitor', role: 'monitor', model, task: 'Watchdog de inatividade do enxame' });
  }

  // -------------------------------------------------------------------------
  // Entrada de eventos do client
  // -------------------------------------------------------------------------

  async handleClientEvent(evt: ClientEvent): Promise<void> {
    switch (evt.type) {
      case 'task:submit':
        await this.submitTask(evt.prompt);
        break;
      case 'board:post':
        await this.post(evt.from ?? 'user', evt.text, 'message');
        break;
      case 'approval:respond':
        this.respondApproval(evt.requestId, evt.approved);
        break;
    }
  }

  /** Usuário envia uma tarefa: publica no mural e acorda o @coordinator. */
  async submitTask(prompt: string): Promise<void> {
    this.openTask = prompt;
    this.taskDone = false;
    this.lastActivityAt = Date.now();
    const trigger: BoardPost = {
      id: randomUUID(),
      agentId: 'user',
      text: `Nova tarefa: ${prompt}`,
      mentions: ['coordinator'],
      ts: Date.now(),
      kind: 'system',
    };
    this.pushPost(trigger);
    await this.wake('coordinator', trigger, 0);
  }

  // -------------------------------------------------------------------------
  // Board (pub/sub por menções)
  // -------------------------------------------------------------------------

  /**
   * Publica uma mensagem no mural e acorda todos os agentes mencionados.
   * `@all` acorda o enxame inteiro (exceto quem postou).
   */
  async post(agentId: string, text: string, kind: BoardPost['kind'] = 'message', depth = 0): Promise<BoardPost> {
    const mentions = this.parseMentions(text);
    const post: BoardPost = {
      id: randomUUID(),
      agentId,
      text,
      mentions,
      ts: Date.now(),
      kind,
    };
    this.pushPost(post);

    const targets = mentions.includes('all')
      ? [...this.agents.keys()].filter((id) => id !== agentId)
      : mentions;
    if (depth < MAX_DEPTH) {
      await Promise.all(targets.map((id) => this.wake(id, post, depth)));
    }
    return post;
  }

  private pushPost(post: BoardPost): void {
    this.posts.push(post);
    if (this.posts.length > MAX_HISTORY) this.posts.shift();
    this.lastActivityAt = Date.now();
    this.emit({ type: 'board:post', post });
  }

  private parseMentions(text: string): string[] {
    const found = new Set<string>();
    for (const m of text.matchAll(/@([a-zA-Z0-9_-]+)/g)) {
      const id = m[1].toLowerCase();
      if (id === 'all' || this.agents.has(id)) found.add(id);
    }
    return [...found];
  }

  // -------------------------------------------------------------------------
  // Ciclo de vida do agente: waiting -> active -> (turno no LLM) -> waiting
  // -------------------------------------------------------------------------

  private async wake(agentId: string, trigger: BoardPost, depth: number): Promise<void> {
    const agent = this.agents.get(agentId);
    // Regra de ouro: só acorda quem está waiting e não foi aposentado.
    // Quem já está active é ignorado (evita tempestade de recursão).
    if (!agent || agent.status !== 'waiting') return;

    agent.status = 'active';
    agent.task = trigger.text.slice(0, 120);
    agent.lastSeen = Date.now();
    this.broadcastAgents();

    try {
      await this.runTurn(agent, trigger, depth);
    } finally {
      this.emit({ type: 'edit:clear', agentId: agent.id });
      if (agent.status === 'active') {
        agent.status = 'waiting';
        agent.task = null;
        agent.lastSeen = Date.now();
        this.broadcastAgents();
      }
    }
  }

  private async runTurn(agent: Agent, trigger: BoardPost, depth: number): Promise<void> {
    const context = this.posts.slice(-30);
    const action = await this.llm.complete({
      agent,
      trigger,
      context,
      openTask: this.openTask,
    });

    for (const text of action.posts ?? []) {
      // O post do agente pode conter @menções e acordar outros agentes (depth + 1).
      await this.post(agent.id, text, 'message', depth + 1);
    }

    for (const edit of action.edits ?? []) {
      const indicator: FileEditIndicator = { path: edit.path, agentId: agent.id, ts: Date.now() };
      this.emit({ type: 'edit:indicator', indicator });
      this.emit({
        type: 'agent:log',
        agentId: agent.id,
        lines: [`✏️ editando ${edit.path} — ${edit.note}`],
      });
    }

    if (action.approval) {
      agent.task = `⏸ Aguardando aprovação: ${action.approval.action}`;
      this.broadcastAgents();
      const approved = await this.requestApproval(
        agent.id,
        action.approval.action,
        action.approval.filePath,
        action.approval.command,
      );
      await this.post(
        agent.id,
        approved
          ? `✅ Aprovado pelo humano: ${action.approval.action}`
          : `⛔ Rejeitado pelo humano: ${action.approval.action}`,
        'system',
        depth + 1,
      );
    }

    if (action.completeTask) {
      this.taskDone = true;
      this.openTask = null;
      this.emit({ type: 'status', message: 'Tarefa concluída e verificada.' });
    }

    if (action.retire) {
      agent.status = 'retired';
      this.broadcastAgents();
    }
  }

  // -------------------------------------------------------------------------
  // Aprovação human-in-the-loop
  // -------------------------------------------------------------------------

  /**
   * Emite o pedido de aprovação e PAUSA a execução do agente (promise pendente)
   * até o client responder com approval:respond.
   */
  requestApproval(
    agentId: string,
    action: string,
    filePath?: string,
    command?: string,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const request: ApprovalRequest = {
        id: randomUUID(),
        agentId,
        action,
        filePath,
        command,
        status: 'pending',
        ts: Date.now(),
      };
      this.pendingApprovals.set(request.id, { request, resolve });
      this.emit({ type: 'approval:request', request });
      void this.post(
        agentId,
        `⏸ Aguardando aprovação humana: ${action}` +
          (filePath ? ` (${filePath})` : '') +
          (command ? ` — comando: \`${command}\`` : ''),
        'approval-request',
      );
    });
  }

  respondApproval(requestId: string, approved: boolean): void {
    const pending = this.pendingApprovals.get(requestId);
    if (!pending) return;
    this.pendingApprovals.delete(requestId);
    pending.request.status = approved ? 'approved' : 'rejected';
    this.emit({ type: 'approval:request', request: pending.request });
    pending.resolve(approved);
  }

  // -------------------------------------------------------------------------
  // Watchdog (@monitor)
  // -------------------------------------------------------------------------

  /**
   * Se houver tarefa em aberto e ninguém postar nada por MONITOR_STALE_MS,
   * o @monitor posta um alerta no mural e acorda o @coordinator.
   */
  startMonitor(
    intervalMs = MONITOR_INTERVAL_MS,
    staleMs = MONITOR_STALE_MS,
  ): void {
    if (this.monitorTimer) return;
    this.monitorTimer = setInterval(() => {
      void (async () => {
        if (this.taskDone) return;
        const staleFor = Date.now() - this.lastActivityAt;
        if (staleFor < staleMs) return;
        const monitor = this.agents.get('monitor');
        if (!monitor || monitor.status === 'retired') return;
        await this.post(
          'monitor',
          `⚠️ Alerta do watchdog: enxame inativo há ${Math.round(staleFor / 1000)}s e a tarefa ainda não foi concluída. @coordinator, retome o controle.`,
          'alert',
        );
      })();
    }, intervalMs);
  }

  stop(): void {
    if (this.monitorTimer) clearInterval(this.monitorTimer);
    this.monitorTimer = null;
  }
}
