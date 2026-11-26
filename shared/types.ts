// Tipos compartilhados entre client e server (Swarm IDE MVP).
// Este arquivo é a única fonte de verdade do protocolo WebSocket + estado do enxame.

export type AgentStatus = 'active' | 'waiting' | 'retired';

export type AgentRole = 'coordinator' | 'worker' | 'verifier' | 'monitor';

export interface Agent {
  /** id curto, usado em menções: @ui-worker -> id "ui-worker" */
  id: string;
  /** nome exibido, ex: "@ui-worker" */
  name: string;
  role: AgentRole;
  /** modelo de IA em uso, ex: "gpt-4o-mini" */
  model: string;
  status: AgentStatus;
  /** tarefa atual (resumo do gatilho que acordou o agente) */
  task: string | null;
  lastSeen: number;
}

export type BoardPostKind = 'message' | 'system' | 'approval-request' | 'alert';

export interface BoardPost {
  id: string;
  /** id do agente que postou ("user" para o humano) */
  agentId: string;
  text: string;
  /** ids de agentes detectados via @menção no texto */
  mentions: string[];
  ts: number;
  kind: BoardPostKind;
}

/** Indicador visual exibido no Monaco quando um agente está editando um arquivo. */
export interface FileEditIndicator {
  path: string;
  agentId: string;
  ts: number;
}

export interface ApprovalRequest {
  id: string;
  agentId: string;
  /** descrição legível da ação pendente, ex: "Sobrescrever server/package.json" */
  action: string;
  filePath?: string;
  command?: string;
  status: 'pending' | 'approved' | 'rejected';
  ts: number;
}

// ---------------------------------------------------------------------------
// Protocolo WebSocket
// ---------------------------------------------------------------------------

/** Eventos client -> server */
export type ClientEvent =
  | { type: 'task:submit'; prompt: string }
  | { type: 'board:post'; text: string; from?: string }
  | { type: 'approval:respond'; requestId: string; approved: boolean }
  | { type: 'agent:log'; agentId: string };

/** Eventos server -> client (broadcast) */
export type ServerEvent =
  | { type: 'agents'; agents: Agent[] }
  | { type: 'board:history'; posts: BoardPost[] }
  | { type: 'board:post'; post: BoardPost }
  | { type: 'edit:indicator'; indicator: FileEditIndicator }
  | { type: 'edit:clear'; agentId: string }
  | { type: 'approval:request'; request: ApprovalRequest }
  | { type: 'agent:log'; agentId: string; lines: string[] }
  | { type: 'status'; message: string };
