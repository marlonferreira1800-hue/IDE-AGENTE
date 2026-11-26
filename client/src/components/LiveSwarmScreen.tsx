import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../api';
import { useSwarm } from '../store';
import type { Agent, AgentRole, ApprovalRequest } from '../../../shared/types';
import AgentGraph from './SwarmPanel/AgentGraph';
import Board from './SwarmPanel/Board';

const ROLE_BADGE: Record<AgentRole, string> = {
  coordinator: 'bg-purple-500/15 text-purple-300 ring-purple-500/30',
  worker: 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30',
  verifier: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  monitor: 'bg-neutral-700/40 text-neutral-300 ring-neutral-600/40',
};

function AgentLogStream({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <div
      ref={ref}
      className="swarm-scroll min-h-[112px] max-h-[140px] flex-1 overflow-y-auto rounded border border-neutral-800/80 bg-neutral-950/80 p-2 font-mono text-[11px] leading-relaxed text-neutral-400"
    >
      {lines.length === 0 ? (
        <span className="text-neutral-600">(sem atividade registrada ainda)</span>
      ) : (
        lines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-words">
            {line}
          </div>
        ))
      )}
    </div>
  );
}

interface AgentLiveCardProps {
  agent: Agent;
  editingPaths: string[];
  pendingApprovals: ApprovalRequest[];
  logs: string[];
  onOpenFile: (path: string) => void;
  onRespondApproval: (requestId: string, approved: boolean) => void;
}

function AgentLiveCard({
  agent,
  editingPaths,
  pendingApprovals,
  logs,
  onOpenFile,
  onRespondApproval,
}: AgentLiveCardProps) {
  const hasPending = pendingApprovals.length > 0;
  const isActive = agent.status === 'active';
  const isRetired = agent.status === 'retired';

  const cardRing = hasPending
    ? 'border-amber-500/70 bg-amber-950/15 ring-1 ring-amber-500/40'
    : isActive
      ? 'border-green-500/60 bg-neutral-900/90 ring-1 ring-green-500/35 shadow-[0_0_20px_-6px_rgba(34,197,94,0.35)]'
      : isRetired
        ? 'border-neutral-800/80 bg-neutral-925/60 opacity-70'
        : 'border-neutral-800 bg-neutral-925';

  return (
    <div className={`flex flex-col gap-2 rounded-lg border p-3 transition-all ${cardRing}`}>
      {/* Cabeçalho do card: status pulsante + nome + role + model */}
      <div className="flex items-center gap-2">
        {hasPending ? (
          <span className="relative flex h-2.5 w-2.5 shrink-0" title="Aguardando aprovação">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
          </span>
        ) : isActive ? (
          <span className="relative flex h-2.5 w-2.5 shrink-0" title="Trabalhando agora">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          </span>
        ) : isRetired ? (
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500/80" title="Aposentado" />
        ) : (
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-neutral-500" title="Aguardando" />
        )}

        <span className="truncate text-sm font-semibold text-neutral-100">{agent.name}</span>

        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ${ROLE_BADGE[agent.role]}`}
        >
          {agent.role}
        </span>

        <span className="ml-auto truncate rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
          {agent.model}
        </span>
      </div>

      {/* Tarefa atual */}
      <div className="min-h-[1.25rem] truncate text-xs text-neutral-300" title={agent.task ?? undefined}>
        {agent.task ? (
          agent.task
        ) : (
          <span className="text-neutral-600">Aguardando @menção...</span>
        )}
      </div>

      {/* Pills de arquivos em edição (clicáveis para abrir no IDE) */}
      {editingPaths.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {editingPaths.map((filePath) => (
            <button
              key={filePath}
              onClick={() => onOpenFile(filePath)}
              className="flex max-w-full items-center gap-1 rounded-full border border-green-500/40 bg-green-500/10 px-2 py-0.5 text-[11px] text-green-300 hover:bg-green-500/20"
              title={`Abrir ${filePath} no editor`}
            >
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-green-400" />
              <span className="truncate">{filePath}</span>
            </button>
          ))}
        </div>
      )}

      {/* Aprovações pendentes inline */}
      {pendingApprovals.map((req) => (
        <div
          key={req.id}
          className="rounded border border-amber-500/50 bg-amber-500/10 p-2 text-xs"
        >
          <div className="font-medium text-amber-300">⏸ {req.action}</div>
          {(req.filePath || req.command) && (
            <div className="mt-0.5 truncate text-[11px] text-amber-200/80">
              {req.filePath ?? req.command}
            </div>
          )}
          <div className="mt-2 flex gap-1.5">
            <button
              onClick={() => onRespondApproval(req.id, true)}
              className="flex-1 rounded bg-green-600/25 px-2 py-1 text-[11px] font-medium text-green-300 ring-1 ring-green-500/50 hover:bg-green-600/40"
            >
              Aprovar
            </button>
            <button
              onClick={() => onRespondApproval(req.id, false)}
              className="flex-1 rounded bg-red-600/20 px-2 py-1 text-[11px] font-medium text-red-300 ring-1 ring-red-500/50 hover:bg-red-600/35"
            >
              Rejeitar
            </button>
          </div>
        </div>
      ))}

      {/* Stream de logs ao vivo */}
      <AgentLogStream lines={logs} />
    </div>
  );
}

/**
 * Tela Única — Enxame ao Vivo: centro de comando onde todos os agentes,
 * logs ao vivo, aprovações, grafo de comunicação e mural ficam visíveis juntos.
 */
export default function LiveSwarmScreen() {
  const [task, setTask] = useState('');
  const agents = useSwarm((s) => s.agents);
  const indicators = useSwarm((s) => s.indicators);
  const approvals = useSwarm((s) => s.approvals);
  const logs = useSwarm((s) => s.logs);
  const send = useSwarm((s) => s.send);
  const setOpenFile = useSwarm((s) => s.setOpenFile);
  const setViewMode = useSwarm((s) => s.setViewMode);

  const agentList = Object.values(agents);
  const activeCount = agentList.filter((a) => a.status === 'active').length;
  const waitingCount = agentList.filter((a) => a.status === 'waiting').length;
  const retiredCount = agentList.filter((a) => a.status === 'retired').length;
  const pendingList = Object.values(approvals).filter((a) => a.status === 'pending');

  const submitTask = (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = task.trim();
    if (!prompt) return;
    send({ type: 'task:submit', prompt });
    setTask('');
  };

  const handleOpenFile = async (filePath: string) => {
    try {
      const r = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(filePath)}`);
      if (r.ok) {
        const data = (await r.json()) as { content?: string };
        setOpenFile({ path: filePath, content: data.content ?? `// ${filePath}\n` });
      } else {
        setOpenFile({ path: filePath, content: `// modo demo — ${filePath}\n` });
      }
    } catch {
      setOpenFile({ path: filePath, content: `// modo demo — ${filePath}\n` });
    }
    setViewMode('ide');
  };

  const handleRespondApproval = (requestId: string, approved: boolean) => {
    send({ type: 'approval:respond', requestId, approved });
  };

  return (
    <div className="swarm-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      {/* Barra superior: envio de tarefa + contadores ao vivo */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-925 px-3 py-2">
        <form onSubmit={submitTask} className="flex min-w-[260px] flex-1 items-center gap-2">
          <input
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Nova tarefa para o enxame..."
            className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-green-500/60"
          />
          <button
            type="submit"
            className="shrink-0 rounded bg-green-600/20 px-3 py-1.5 text-xs font-medium text-green-400 ring-1 ring-green-500/40 hover:bg-green-600/30"
          >
            Enviar
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-green-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
            {activeCount} trabalhando
          </span>
          <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-neutral-300">
            {waitingCount} aguardando
          </span>
          <span className="rounded-full border border-neutral-800 bg-neutral-900/60 px-2.5 py-1 text-neutral-400">
            {retiredCount} aposentados
          </span>
          {pendingList.length > 0 && (
            <span className="rounded-full border border-amber-500/50 bg-amber-500/15 px-2.5 py-1 font-medium text-amber-300">
              ⏸ {pendingList.length} aprovação(ões)
            </span>
          )}
        </div>
      </div>

      {/* Grid de Cards dos Agentes ao Vivo */}
      {agentList.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-925 p-6 text-center text-xs text-neutral-500">
          Conectando aos agentes do enxame...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {agentList.map((agent) => (
            <AgentLiveCard
              key={agent.id}
              agent={agent}
              editingPaths={indicators
                .filter((i) => i.agentId === agent.id)
                .map((i) => i.path)}
              pendingApprovals={pendingList.filter((a) => a.agentId === agent.id)}
              logs={logs[agent.id] ?? []}
              onOpenFile={handleOpenFile}
              onRespondApproval={handleRespondApproval}
            />
          ))}
        </div>
      )}

      {/* Split inferior: AgentGraph (esquerda) + Board (direita) */}
      <div className="grid min-h-[340px] flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
        <section className="flex min-h-[320px] flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-925">
          <div className="shrink-0 border-b border-neutral-800 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Grafo de Comunicação ao Vivo
          </div>
          <div className="min-h-0 flex-1">
            <AgentGraph />
          </div>
        </section>

        <section className="flex min-h-[320px] flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-925">
          <div className="shrink-0 border-b border-neutral-800 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Mural Público (@menções)
          </div>
          <div className="min-h-0 flex-1">
            <Board />
          </div>
        </section>
      </div>
    </div>
  );
}
