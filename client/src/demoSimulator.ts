import type {
  Agent,
  AgentStatus,
  ApprovalRequest,
  BoardPost,
  ClientEvent,
  ServerEvent,
} from '../../shared/types';
import { useSwarm } from './store';

/**
 * Simulador local: se o WebSocket não conectar (server fora do ar), o painel
 * segue funcionando com agentes concorrentes, logs em tempo real, aprovações
 * interativas e resposta a tarefas/menções no mural.
 */

export interface DemoHandle {
  stop: () => void;
  send: (evt: ClientEvent) => void;
}

const INITIAL_AGENTS: Agent[] = [
  { id: 'coordinator', name: '@coordinator', role: 'coordinator', model: 'simulado', status: 'waiting', task: null, lastSeen: Date.now() },
  { id: 'ui-worker', name: '@ui-worker', role: 'worker', model: 'simulado', status: 'waiting', task: null, lastSeen: Date.now() },
  { id: 'api-worker', name: '@api-worker', role: 'worker', model: 'simulado', status: 'waiting', task: null, lastSeen: Date.now() },
  { id: 'verifier', name: '@verifier', role: 'verifier', model: 'simulado', status: 'waiting', task: null, lastSeen: Date.now() },
  { id: 'monitor', name: '@monitor', role: 'monitor', model: 'simulado', status: 'waiting', task: null, lastSeen: Date.now() },
];

const WORKER_FILES: Record<string, string> = {
  coordinator: 'swarm-ide/shared/types.ts',
  'ui-worker': 'client/src/components/LiveSwarmScreen.tsx',
  'api-worker': 'server/src/engine/SwarmEngine.ts',
  verifier: 'server/src/engine/SwarmEngine.test.ts',
  monitor: 'server/src/index.ts',
};

export function startDemoSimulator(): DemoHandle {
  let stopped = false;
  let seq = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const agents: Agent[] = INITIAL_AGENTS.map((a) => ({ ...a, lastSeen: Date.now() }));
  const pendingApprovals = new Map<string, { request: ApprovalRequest; onResolve: (approved: boolean) => void }>();

  const emit = (evt: ServerEvent): void => {
    if (stopped) return;
    useSwarm.getState().applyServerEvent(evt);
  };

  const schedule = (ms: number, fn: () => void): void => {
    if (stopped) return;
    const t = setTimeout(() => {
      timers.delete(t);
      if (!stopped) fn();
    }, ms);
    timers.add(t);
  };

  const stamp = (): string => new Date().toLocaleTimeString();

  const emitLog = (agentId: string, ...lines: string[]): void => {
    emit({
      type: 'agent:log',
      agentId,
      lines: lines.map((l) => `[${stamp()}] ${l}`),
    });
  };

  const setAgent = (id: string, status: AgentStatus, task: string | null = null): void => {
    const target = agents.find((a) => a.id === id);
    if (target) {
      target.status = status;
      target.task = task;
      target.lastSeen = Date.now();
    }
    emit({ type: 'agents', agents: agents.map((a) => ({ ...a })) });
  };

  const parseMentions = (text: string): string[] => {
    const found = new Set<string>();
    for (const m of text.matchAll(/@([a-zA-Z0-9_-]+)/g)) {
      const id = m[1].toLowerCase();
      if (id === 'all' || agents.some((a) => a.id === id)) found.add(id);
    }
    return [...found];
  };

  const post = (agentId: string, text: string, kind: BoardPost['kind'] = 'message'): string[] => {
    const mentions = parseMentions(text);
    emit({
      type: 'board:post',
      post: {
        id: `demo-${seq++}`,
        agentId,
        text,
        mentions,
        ts: Date.now(),
        kind,
      },
    });
    return mentions;
  };

  const runVerifier = (summary: string): void => {
    setAgent('verifier', 'active', 'Validando diffs e testes');
    emitLog('verifier', 'Iniciando verificação final do enxame...', 'Executando typecheck e validação de contratos');
    schedule(1200, () => {
      emitLog('verifier', summary);
      emit({ type: 'edit:clear', agentId: 'verifier' });
      setAgent('verifier', 'waiting');
      post('verifier', `✅ ${summary} @all tarefa concluída.`);
    });
  };

  // Estado inicial dos agentes
  emit({ type: 'agents', agents: agents.map((a) => ({ ...a })) });

  // Fluxo inicial demonstrando paralelismo real + aprovação interativa
  schedule(400, () => {
    setAgent('coordinator', 'active', 'Briefing da tarefa');
    emitLog('coordinator', 'Recebida tarefa inicial do workspace demo', 'Dividindo escopo entre @ui-worker e @api-worker');
    post('coordinator', '📋 Briefing: montar o MVP da IDE Swarm. @ui-worker cuida da tela ao vivo, @api-worker do engine.');
  });

  schedule(1300, () => {
    setAgent('coordinator', 'waiting');
    // Ambos os workers ficam ativos concorrentemente!
    setAgent('ui-worker', 'active', 'Construindo LiveSwarmScreen.tsx');
    setAgent('api-worker', 'active', 'Editando SwarmEngine.ts');

    emit({
      type: 'edit:indicator',
      indicator: { path: 'client/src/components/SwarmPanel/SwarmPanel.tsx', agentId: 'ui-worker', ts: Date.now() },
    });
    emit({
      type: 'edit:indicator',
      indicator: { path: 'server/src/engine/SwarmEngine.ts', agentId: 'api-worker', ts: Date.now() },
    });

    emitLog('ui-worker', 'Analisando store.ts e componentes do SwarmPanel', 'Renderizando cards ao vivo por agente');
    emitLog('api-worker', 'Corrigindo parseMentions para suportar @all', 'Disparando wake() concorrente via Promise.all');
  });

  schedule(2600, () => {
    emitLog('ui-worker', 'Adicionando composer de mensagens no mural e indicador pulsante');
    emitLog('api-worker', 'Emitindo edit:clear no bloco finally de wake()');
    post('ui-worker', '🔧 Tela única ao vivo pronta em `SwarmPanel.tsx` / `LiveSwarmScreen.tsx`.');
  });

  schedule(3800, () => {
    emit({ type: 'edit:clear', agentId: 'ui-worker' });
    setAgent('ui-worker', 'waiting');
    emitLog('ui-worker', 'Turno finalizado; aguardando próximas menções.');

    const reqId = `demo-appr-${seq++}`;
    const request: ApprovalRequest = {
      id: reqId,
      agentId: 'api-worker',
      action: 'Sobrescrever arquivo crítico',
      filePath: 'server/package.json',
      status: 'pending',
      ts: Date.now(),
    };
    setAgent('api-worker', 'active', `⏸ Aguardando aprovação: ${request.action}`);
    emitLog('api-worker', 'Pausado aguardando aprovação humana para server/package.json');
    emit({ type: 'approval:request', request });
    post('api-worker', '⏸ Aguardando aprovação humana para sobrescrever `server/package.json`.', 'approval-request');

    pendingApprovals.set(reqId, {
      request,
      onResolve: (approved) => {
        if (approved) {
          emitLog('api-worker', 'Aprovação concedida! Aplicando alteração em server/package.json...');
          setAgent('api-worker', 'active', 'Finalizando server/package.json');
          schedule(800, () => {
            emit({ type: 'edit:clear', agentId: 'api-worker' });
            setAgent('api-worker', 'waiting');
            post('api-worker', '🔧 Engine + `server/package.json` atualizados. @verifier, pode validar.');
            schedule(500, () => runVerifier('Verificação concluída: build e testes consistentes.'));
          });
        } else {
          emitLog('api-worker', 'Aprovação rejeitada. Alteração abortada com segurança.');
          emit({ type: 'edit:clear', agentId: 'api-worker' });
          setAgent('api-worker', 'waiting');
          post('api-worker', '❌ Alteração em `server/package.json` rejeitada pelo usuário.', 'alert');
        }
      },
    });
  });

  const wakeFromMention = (agentId: string, promptText: string): void => {
    const file = WORKER_FILES[agentId] ?? 'shared/types.ts';
    setAgent(agentId, 'active', `Processando: ${promptText.slice(0, 42)}`);
    emitLog(agentId, `Acordado por menção: "${promptText}"`);
    if (agentId === 'ui-worker' || agentId === 'api-worker') {
      emit({
        type: 'edit:indicator',
        indicator: { path: file, agentId, ts: Date.now() },
      });
    }
    schedule(900 + Math.floor(Math.random() * 600), () => {
      emitLog(agentId, `Executando ação solicitada em ${file}`);
    });
    schedule(1800 + Math.floor(Math.random() * 600), () => {
      emit({ type: 'edit:clear', agentId });
      setAgent(agentId, 'waiting');
      emitLog(agentId, 'Turno concluído.');
      post(agentId, `✅ [${agentId}] concluído para: "${promptText.slice(0, 60)}"`);
    });
  };

  const send = (evt: ClientEvent): void => {
    if (stopped) return;

    switch (evt.type) {
      case 'task:submit': {
        const prompt = evt.prompt.trim();
        if (!prompt) return;
        post('user', `Nova tarefa: ${prompt}`, 'system');
        setAgent('coordinator', 'active', `Planejando: ${prompt.slice(0, 40)}`);
        emitLog('coordinator', `Nova tarefa recebida: "${prompt}"`);

        schedule(700, () => {
          setAgent('coordinator', 'waiting');
          post('coordinator', `📋 Delegando "${prompt}": @ui-worker cuida da interface, @api-worker da lógica.`);

          // Dispara ambos os workers simultaneamente
          setAgent('ui-worker', 'active', `UI: ${prompt.slice(0, 36)}`);
          setAgent('api-worker', 'active', `API: ${prompt.slice(0, 36)}`);
          emit({
            type: 'edit:indicator',
            indicator: { path: WORKER_FILES['ui-worker'], agentId: 'ui-worker', ts: Date.now() },
          });
          emit({
            type: 'edit:indicator',
            indicator: { path: WORKER_FILES['api-worker'], agentId: 'api-worker', ts: Date.now() },
          });
          emitLog('ui-worker', `Implementando mudanças de UI para "${prompt}"`);
          emitLog('api-worker', `Implementando mudanças de engine para "${prompt}"`);

          schedule(1500, () => {
            emit({ type: 'edit:clear', agentId: 'ui-worker' });
            setAgent('ui-worker', 'waiting');
            emitLog('ui-worker', 'Alterações de UI concluídas.');
            post('ui-worker', `🎨 Interface atualizada para "${prompt}".`);
          });

          schedule(2000, () => {
            emit({ type: 'edit:clear', agentId: 'api-worker' });
            setAgent('api-worker', 'waiting');
            emitLog('api-worker', 'Alterações de backend concluídas.');
            post('api-worker', `⚙️ Engine atualizado para "${prompt}". @verifier, validar.`);

            schedule(500, () => {
              runVerifier(`Tarefa "${prompt}" validada sem erros.`);
            });
          });
        });
        break;
      }

      case 'board:post': {
        const text = evt.text.trim();
        if (!text) return;
        const from = evt.from ?? 'user';
        const mentions = post(from, text, 'message');
        const targets = mentions.includes('all')
          ? agents.map((a) => a.id).filter((id) => id !== from)
          : mentions.filter((id) => id !== from);

        targets.forEach((id, idx) => {
          schedule(250 + idx * 150, () => wakeFromMention(id, text));
        });
        break;
      }

      case 'approval:respond': {
        const entry = pendingApprovals.get(evt.requestId);
        if (entry) {
          pendingApprovals.delete(evt.requestId);
          emit({
            type: 'approval:request',
            request: { ...entry.request, status: evt.approved ? 'approved' : 'rejected' },
          });
          entry.onResolve(evt.approved);
        } else {
          const existing = useSwarm.getState().approvals[evt.requestId];
          if (existing) {
            emit({
              type: 'approval:request',
              request: { ...existing, status: evt.approved ? 'approved' : 'rejected' },
            });
          }
        }
        break;
      }
    }
  };

  const stop = (): void => {
    stopped = true;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    pendingApprovals.clear();
  };

  return { stop, send };
}
