import { useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSwarm } from '../../store';
import type { Agent, AgentStatus } from '../../../../shared/types';

const STATUS_COLOR: Record<AgentStatus, string> = {
  active: '#22c55e',
  waiting: '#737373',
  retired: '#ef4444',
};

const EDGE_HOT_MS = 8_000;

function NodeLabel({ agent }: { agent: Agent }) {
  return (
    <div className="flex items-center gap-1.5 rounded border bg-neutral-900 px-2 py-1 text-xs shadow">
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: STATUS_COLOR[agent.status], boxShadow: agent.status === 'active' ? `0 0 8px ${STATUS_COLOR.active}` : 'none' }}
      />
      <span className="font-medium text-neutral-200">{agent.name}</span>
    </div>
  );
}

/**
 * Grafo ao vivo: cada agente é um nó; toda @menção no Board vira uma aresta
 * que "acende" (animada e ciano) por alguns segundos.
 */
export default function AgentGraph() {
  const agents = useSwarm((s) => s.agents);
  const edges = useSwarm((s) => s.edges);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const agentList = Object.values(agents);

  const nodes: Node[] = useMemo(() => {
    const n = agentList.length;
    const radius = Math.max(140, n * 45);
    return agentList.map((a, i) => {
      const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
      return {
        id: a.id,
        position: { x: 210 + radius * Math.cos(angle), y: 170 + radius * Math.sin(angle) },
        data: { label: <NodeLabel agent={a} /> },
        style: {
          border: `1.5px solid ${STATUS_COLOR[a.status]}`,
          borderRadius: 8,
          padding: 0,
          background: 'transparent',
          width: 'auto',
        },
      } satisfies Node;
    });
  }, [agentList]);

  const flowEdges: Edge[] = useMemo(() => {
    const ids = new Set(agentList.map((a) => a.id));
    return edges
      .filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target)
      .slice(-30)
      .map((e) => {
        const hot = now - e.ts < EDGE_HOT_MS;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          animated: hot,
          style: { stroke: hot ? '#22d3ee' : '#3f3f46', strokeWidth: hot ? 2.5 : 1 },
        } satisfies Edge;
      });
  }, [edges, agentList, now]);

  return (
    <div className="h-full w-full">
      <ReactFlow nodes={nodes} edges={flowEdges} fitView proOptions={{ hideAttribution: true }}>
        <Background color="#262626" gap={18} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
