export const isTauri =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window ||
    location.protocol === 'tauri:' ||
    location.hostname === 'tauri.localhost');

export const API_BASE =
  import.meta.env.VITE_API_URL ?? (isTauri ? 'http://127.0.0.1:4000' : '');

export const WS_URL =
  import.meta.env.VITE_WS_URL ??
  (isTauri
    ? 'ws://127.0.0.1:4000/ws'
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
