import { useEffect } from 'react';
import { useSwarm } from '../store';

export default function StatusBar() {
  const agents = useSwarm((s) => s.agents);
  const posts = useSwarm((s) => s.posts);
  const approvals = useSwarm((s) => s.approvals);
  const send = useSwarm((s) => s.send);
  const connected = useSwarm((s) => s.connected);

  const activeCount = Object.values(agents).filter((a) => a.status === 'active').length;
  const waitingCount = Object.values(agents).filter((a) => a.status === 'waiting').length;
  const pending = Object.values(approvals).filter((a) => a.status === 'pending');
  const lastPost = posts[posts.length - 1];

  const approveAll = () => {
    for (const p of pending) {
      send({ type: 'approval:respond', requestId: p.id, approved: true });
    }
  };

  // Atalho: Ctrl/Cmd + Enter aprova todas as ações pendentes (human-in-the-loop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') approveAll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.length, connected]);

  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-neutral-800 bg-neutral-925 px-3 text-xs text-neutral-400">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
        {activeCount} ativo(s) · {waitingCount} aguardando
      </span>
      <span className="min-w-0 flex-1 truncate">
        {lastPost ? (
          <>
            <span className="text-neutral-500">último post:</span>{' '}
            <span className="text-cyan-400">@{lastPost.agentId}</span> {lastPost.text}
          </>
        ) : (
          'mural vazio — envie uma tarefa ao enxame'
        )}
      </span>
      {pending.length > 0 && (
        <button
          onClick={approveAll}
          className="rounded bg-amber-500/15 px-2 py-0.5 font-medium text-amber-400 ring-1 ring-amber-500/50 hover:bg-amber-500/25"
          title="Ctrl/Cmd + Enter"
        >
          Aprovar {pending.length} pendente(s) ⌘↵
        </button>
      )}
    </footer>
  );
}
