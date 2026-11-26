import { create } from 'zustand';
import type {
  Agent,
  ApprovalRequest,
  BoardPost,
  ClientEvent,
  ServerEvent,
} from '../../shared/types';

export interface MentionEdge {
  id: string;
  source: string;
  target: string;
  ts: number;
}

export type ViewMode = 'live' | 'ide';

interface SwarmState {
  connected: boolean;
  viewMode: ViewMode;
  agents: Record<string, Agent>;
  posts: BoardPost[];
  indicators: import('../../shared/types').FileEditIndicator[];
  approvals: Record<string, ApprovalRequest>;
  logs: Record<string, string[]>;
  /** arestas recentes do grafo (menções no mural) */
  edges: MentionEdge[];
  follow: boolean;
  filter: string; // 'all' | agentId
  selectedAgent: string | null;
  openFile: { path: string; content: string } | null;

  registerSender: (fn: (evt: ClientEvent) => void) => void;
  send: (evt: ClientEvent) => void;
  setConnected: (c: boolean) => void;
  setViewMode: (m: ViewMode) => void;
  setFollow: (f: boolean) => void;
  setFilter: (f: string) => void;
  selectAgent: (id: string | null) => void;
  setOpenFile: (f: { path: string; content: string } | null) => void;
  applyServerEvent: (evt: ServerEvent) => void;
}

export const useSwarm = create<SwarmState>((set, get) => ({
  connected: false,
  viewMode: 'live',
  agents: {},
  posts: [],
  indicators: [],
  approvals: {},
  logs: {},
  edges: [],
  follow: true,
  filter: 'all',
  selectedAgent: null,
  openFile: null,

  registerSender: (fn) => bindSender(fn),
  send: (evt) => sender?.(evt),
  setConnected: (connected) => set({ connected }),
  setViewMode: (viewMode) => set({ viewMode }),
  setFollow: (follow) => set({ follow }),
  setFilter: (filter) => set({ filter }),
  selectAgent: (selectedAgent) => set({ selectedAgent }),
  setOpenFile: (openFile) => set({ openFile }),

  applyServerEvent: (evt) => {
    switch (evt.type) {
      case 'agents': {
        const agents = Object.fromEntries(evt.agents.map((a) => [a.id, a]));
        const indicators = get().indicators.filter((i) => agents[i.agentId]?.status === 'active');
        set({ agents, indicators });
        break;
      }
      case 'board:history': {
        const seeded: Record<string, string[]> = {};
        for (const p of evt.posts) {
          const line = `[${new Date(p.ts).toLocaleTimeString()}] ${p.text}`;
          (seeded[p.agentId] ??= []).push(line);
        }
        for (const id of Object.keys(seeded)) {
          seeded[id] = seeded[id].slice(-300);
        }
        set({ posts: evt.posts, logs: seeded });
        break;
      }
      case 'board:post': {
        const { posts, edges, logs, agents } = get();
        const expandedTargets = new Set<string>();
        for (const m of evt.post.mentions) {
          if (m === 'all') {
            for (const id of Object.keys(agents)) {
              if (id !== evt.post.agentId) expandedTargets.add(id);
            }
          } else {
            expandedTargets.add(m);
          }
        }
        const newEdges: MentionEdge[] = [...expandedTargets].map((m) => ({
          id: `${evt.post.id}:${m}`,
          source: evt.post.agentId,
          target: m,
          ts: evt.post.ts,
        }));
        const line = `[${new Date(evt.post.ts).toLocaleTimeString()}] ${evt.post.text}`;
        set({
          posts: [...posts, evt.post],
          edges: [...edges.slice(-80), ...newEdges],
          logs: {
            ...logs,
            [evt.post.agentId]: [...(logs[evt.post.agentId] ?? []), line].slice(-300),
          },
        });
        break;
      }
      case 'edit:indicator':
        set({
          indicators: [
            ...get().indicators.filter((i) => i.path !== evt.indicator.path),
            evt.indicator,
          ],
        });
        break;
      case 'edit:clear':
        set({
          indicators: get().indicators.filter((i) => i.agentId !== evt.agentId),
        });
        break;
      case 'approval:request':
        set({ approvals: { ...get().approvals, [evt.request.id]: evt.request } });
        break;
      case 'agent:log': {
        const logs = get().logs;
        set({
          logs: {
            ...logs,
            [evt.agentId]: [...(logs[evt.agentId] ?? []), ...evt.lines].slice(-300),
          },
        });
        break;
      }
      case 'status':
        break;
    }
  },
}));

// sender registrado pelo hook de WebSocket (evita ciclo store -> ws -> store)
let sender: ((evt: ClientEvent) => void) | null = null;
export function bindSender(fn: (evt: ClientEvent) => void): void {
  sender = fn;
}
