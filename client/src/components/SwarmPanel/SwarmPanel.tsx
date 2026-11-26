import { useState } from 'react';
import { useSwarm } from '../../store';
import Board from './Board';
import Members from './Members';
import AgentGraph from './AgentGraph';

type Tab = 'board' | 'members' | 'graph';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'board', label: 'Board' },
  { id: 'members', label: 'Members' },
  { id: 'graph', label: 'Graph' },
];

/**
 * Painel Swarm — centro de controle do enxame, com 3 abas sincronizadas:
 * Board (mural público com @menções), Members (elenco por status) e
 * Graph (grafo de comunicação ao vivo).
 */
export default function SwarmPanel() {
  const [tab, setTab] = useState<Tab>('board');
  const [task, setTask] = useState('');
  const send = useSwarm((s) => s.send);

  const submitTask = (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = task.trim();
    if (!prompt) return;
    send({ type: 'task:submit', prompt });
    setTask('');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-neutral-800 px-2 pt-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t px-3 py-1.5 text-xs font-medium ${
              tab === t.id
                ? 'bg-neutral-800 text-green-400'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={submitTask} className="flex shrink-0 gap-1.5 border-b border-neutral-800 p-2">
        <input
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Nova tarefa para o enxame..."
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-green-500/60"
        />
        <button
          type="submit"
          className="shrink-0 rounded bg-green-600/20 px-2.5 py-1 text-xs font-medium text-green-400 ring-1 ring-green-500/40 hover:bg-green-600/30"
        >
          Enviar
        </button>
      </form>

      <div className="min-h-0 flex-1">
        {tab === 'board' && <Board />}
        {tab === 'members' && <Members />}
        {tab === 'graph' && <AgentGraph />}
      </div>
    </div>
  );
}
