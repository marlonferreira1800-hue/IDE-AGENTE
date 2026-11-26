import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import type { ClientEvent, ServerEvent } from '../../shared/types';
import { SwarmEngine } from './engine/SwarmEngine';
import { createLLMProvider } from './llm/LLMProvider';
import { safeResolve, walkProjectFiles } from './fsSafe';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4000);
// Raiz do projeto que o explorador de arquivos da IDE exibe/edita.
const PROJECT_ROOT = path.resolve(
  process.env.PROJECT_ROOT ?? path.join(__dirname, '..', 'demo-project'),
);

// ---------------------------------------------------------------------------
// HTTP: explorador de arquivos + submissão de tarefa
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (url.pathname === '/api/health') {
    res.end(JSON.stringify({ ok: true, projectRoot: PROJECT_ROOT }));
    return;
  }

  if (url.pathname === '/api/files') {
    try {
      res.end(JSON.stringify({ files: walkProjectFiles(PROJECT_ROOT, PROJECT_ROOT) }));
    } catch {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'projeto não encontrado', projectRoot: PROJECT_ROOT }));
    }
    return;
  }

  if (url.pathname === '/api/file') {
    const rel = url.searchParams.get('path') ?? '';
    const full = safeResolve(PROJECT_ROOT, rel);
    if (!full || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'arquivo não encontrado' }));
      return;
    }
    res.end(JSON.stringify({ path: rel, content: fs.readFileSync(full, 'utf-8') }));
    return;
  }

  if (url.pathname === '/api/task' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const { prompt } = JSON.parse(body) as { prompt?: string };
        if (!prompt) throw new Error('prompt vazio');
        void engine.submitTask(prompt);
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not found' }));
});

// ---------------------------------------------------------------------------
// WebSocket: stream em tempo real do SwarmEngine para todos os clientes
// ---------------------------------------------------------------------------

const engine = new SwarmEngine(createLLMProvider());
engine.registerDefaultAgents();
engine.startMonitor();

const wss = new WebSocketServer({ server, path: '/ws' });

engine.onEvent((evt: ServerEvent) => {
  const msg = JSON.stringify(evt);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
});

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'board:history', posts: engine.getHistory() } satisfies ServerEvent));
  ws.send(JSON.stringify({ type: 'agents', agents: engine.getAgents() } satisfies ServerEvent));
  ws.on('message', (raw) => {
    try {
      const evt = JSON.parse(String(raw)) as ClientEvent;
      void engine.handleClientEvent(evt);
    } catch (err) {
      console.error('[ws] evento inválido:', err);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[swarm-ide] server em http://localhost:${PORT}`);
  console.log(`[swarm-ide] ws em ws://localhost:${PORT}/ws`);
  console.log(`[swarm-ide] explorando projeto em ${PROJECT_ROOT}`);
});
