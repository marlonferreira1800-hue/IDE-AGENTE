import type { ClientEvent, ServerEvent } from '../../shared/types';
import { WS_URL } from './api';

export interface SocketHandle {
  send: (evt: ClientEvent) => void;
  close: () => void;
}

/**
 * Conecta no orquestrador via WebSocket (com reconexão automática).
 * Em dev, usa o proxy do Vite (mesma origem, /ws). Em Tauri, usa 127.0.0.1:4000/ws.
 * Override: VITE_WS_URL.
 */
export function connectSwarmSocket(
  onEvent: (evt: ServerEvent) => void,
  onStatus: (connected: boolean) => void,
): SocketHandle {
  const url = WS_URL;

  let ws: WebSocket | null = null;
  let closed = false;

  const open = (): void => {
    ws = new WebSocket(url);
    ws.onopen = () => onStatus(true);
    ws.onmessage = (msg) => {
      try {
        onEvent(JSON.parse(String(msg.data)) as ServerEvent);
      } catch {
        // mensagem malformada: ignora
      }
    };
    ws.onclose = () => {
      onStatus(false);
      if (!closed) setTimeout(open, 2000);
    };
    ws.onerror = () => ws?.close();
  };

  open();

  return {
    send: (evt) => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(evt));
    },
    close: () => {
      closed = true;
      ws?.close();
    },
  };
}
