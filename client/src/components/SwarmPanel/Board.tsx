import { useEffect, useRef, useState } from 'react';
import { useSwarm } from '../../store';
import type { BoardPost } from '../../../../shared/types';

/** Destaca @menções no texto do mural. */
function renderText(text: string): React.ReactNode {
  return text.split(/(@[a-zA-Z0-9_-]+)/g).map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="font-medium text-cyan-400">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

const KIND_STYLE: Record<BoardPost['kind'], string> = {
  message: '',
  system: 'border-l-2 border-neutral-600 pl-2',
  'approval-request': 'border-l-2 border-amber-500 pl-2',
  alert: 'border-l-2 border-red-500 pl-2',
};

export default function Board() {
  const posts = useSwarm((s) => s.posts);
  const agents = useSwarm((s) => s.agents);
  const approvals = useSwarm((s) => s.approvals);
  const follow = useSwarm((s) => s.follow);
  const setFollow = useSwarm((s) => s.setFollow);
  const filter = useSwarm((s) => s.filter);
  const setFilter = useSwarm((s) => s.setFilter);
  const send = useSwarm((s) => s.send);
  const [message, setMessage] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll em "Follow mode"
  useEffect(() => {
    const el = listRef.current;
    if (el && follow) el.scrollTop = el.scrollHeight;
  }, [posts, follow, filter]);

  const filtered = posts.filter((p) => filter === 'all' || p.agentId === filter);
  const pending = Object.values(approvals).filter((a) => a.status === 'pending');

  const respond = (requestId: string, approved: boolean) => {
    send({ type: 'approval:respond', requestId, approved });
  };

  const submitPost = (e: React.FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (!text) return;
    send({ type: 'board:post', text });
    setMessage('');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-800 px-2 py-1.5">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-xs text-neutral-300 outline-none"
        >
          <option value="all">todos os agentes</option>
          {Object.values(agents).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => setFollow(!follow)}
          className={`ml-auto rounded px-2 py-0.5 text-xs ring-1 ${
            follow
              ? 'bg-cyan-500/15 text-cyan-400 ring-cyan-500/40'
              : 'text-neutral-500 ring-neutral-700 hover:text-neutral-300'
          }`}
          title="Auto-scroll automático"
        >
          {follow ? '▶ follow' : '⏸ pausado'}
        </button>
      </div>

      <div ref={listRef} className="swarm-scroll min-h-0 flex-1 overflow-y-auto p-2">
        {pending.map((req) => (
          <div
            key={req.id}
            className="mb-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs"
          >
            <div className="font-medium text-amber-400">
              ⏸ Aprovação pendente — @{req.agentId}
            </div>
            <div className="mt-0.5 text-neutral-300">
              {req.action}
              {req.filePath ? ` (${req.filePath})` : ''}
              {req.command ? ` — comando: ${req.command}` : ''}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <button
                onClick={() => respond(req.id, true)}
                className="rounded bg-green-600/25 px-2 py-0.5 text-green-400 ring-1 ring-green-500/50 hover:bg-green-600/40"
              >
                Aprovar
              </button>
              <button
                onClick={() => respond(req.id, false)}
                className="rounded bg-red-600/20 px-2 py-0.5 text-red-400 ring-1 ring-red-500/50 hover:bg-red-600/35"
              >
                Rejeitar
              </button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="p-4 text-center text-xs text-neutral-600">
            Mural vazio. Envie uma tarefa acima para acordar o enxame.
          </div>
        )}

        {filtered.map((p) => (
          <div key={p.id} className={`mb-1.5 rounded px-2 py-1.5 text-xs ${KIND_STYLE[p.kind]} hover:bg-neutral-900`}>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-green-400">@{p.agentId}</span>
              <span className="text-[10px] text-neutral-500">
                {new Date(p.ts).toLocaleTimeString()}
              </span>
              {p.kind !== 'message' && (
                <span className="rounded bg-neutral-800 px-1 text-[10px] uppercase tracking-wide text-neutral-400">
                  {p.kind}
                </span>
              )}
            </div>
            <div className="mt-0.5 whitespace-pre-wrap break-words text-neutral-300">
              {renderText(p.text)}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={submitPost} className="flex shrink-0 gap-1.5 border-t border-neutral-800 p-2">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Postar no mural (@ui-worker, @all...)"
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-cyan-500/60"
        />
        <button
          type="submit"
          className="shrink-0 rounded bg-cyan-600/20 px-2.5 py-1 text-xs font-medium text-cyan-300 ring-1 ring-cyan-500/40 hover:bg-cyan-600/30"
        >
          Postar
        </button>
      </form>
    </div>
  );
}
