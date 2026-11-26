import { useEffect, useRef } from 'react';
import { useSwarm } from '../../store';
import type { Agent, AgentStatus } from '../../../../shared/types';

function StatusDot({ status }: { status: AgentStatus }) {
  if (status === 'active') {
    return (
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
      </span>
    );
  }
  if (status === 'waiting') {
    return <span className="inline-flex h-2.5 w-2.5 rounded-full bg-neutral-500" />;
  }
  return <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />;
}

const GROUPS: Array<{ status: AgentStatus; label: string }> = [
  { status: 'active', label: 'Active' },
  { status: 'waiting', label: 'Waiting' },
  { status: 'retired', label: 'Retired' },
];

export default function Members() {
  const agents = useSwarm((s) => s.agents);
  const selectedAgent = useSwarm((s) => s.selectedAgent);
  const selectAgent = useSwarm((s) => s.selectAgent);
  const logs = useSwarm((s) => s.logs);
  const logRef = useRef<HTMLDivElement>(null);

  const list = Object.values(agents);
  const selected = selectedAgent ? agents[selectedAgent] : undefined;

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs, selectedAgent]);

  return (
    <div className="flex h-full flex-col">
      <div className="swarm-scroll min-h-0 flex-1 overflow-y-auto p-2">
        {GROUPS.map((g) => {
          const members = list.filter((a) => a.status === g.status);
          if (members.length === 0) return null;
          return (
            <div key={g.status} className="mb-3">
              <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                {g.label} ({members.length})
              </div>
              {members.map((a: Agent) => (
                <button
                  key={a.id}
                  onClick={() => selectAgent(selectedAgent === a.id ? null : a.id)}
                  className={`mb-1 flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left text-xs hover:bg-neutral-900 ${
                    selectedAgent === a.id ? 'border-green-500/50 bg-neutral-900' : 'border-neutral-800'
                  }`}
                >
                  <StatusDot status={a.status} />
                  <span className="font-medium text-neutral-200">{a.name}</span>
                  <span className="rounded bg-neutral-800 px-1 text-[10px] text-neutral-400">{a.model}</span>
                  {a.task && (
                    <span className="ml-auto max-w-[45%] truncate text-[10px] text-neutral-500" title={a.task}>
                      {a.task}
                    </span>
                  )}
                </button>
              ))}
            </div>
          );
        })}
        {list.length === 0 && (
          <div className="p-4 text-center text-xs text-neutral-600">Nenhum agente registrado.</div>
        )}
      </div>

      {selected && (
        <div className="flex h-40 shrink-0 flex-col border-t border-neutral-800">
          <div className="flex items-center gap-2 border-b border-neutral-800 px-2 py-1 text-xs">
            <StatusDot status={selected.status} />
            <span className="font-medium text-neutral-200">log de {selected.name}</span>
            <button
              onClick={() => selectAgent(null)}
              className="ml-auto text-neutral-500 hover:text-neutral-300"
            >
              ✕
            </button>
          </div>
          <div ref={logRef} className="swarm-scroll min-h-0 flex-1 overflow-y-auto p-2 font-mono text-[11px] text-neutral-400">
            {(logs[selected.id] ?? ['(sem logs ainda)']).map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
