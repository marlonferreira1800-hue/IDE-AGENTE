# Swarm IDE (MVP)

IDE desktop/web baseada no conceito de **Swarm (enxame de agentes)** com
monitoramento visual integrado em tempo real — com backend em **Rust (`axum` + `tokio`)**
ou **Node.js**, empacotável como app desktop nativo via **Tauri v2**.

## Arquitetura

```
swarm-ide/
├── shared/
│   └── types.ts                  # Contrato JSON compartilhado (Agent, BoardPost, ClientEvent, ServerEvent)
├── server-rust/                  # Orquestrador Rust (axum + tokio + reqwest + serde)
│   ├── src/engine.rs             # SwarmEngine concorrente (join_all, @all, edit:clear, oneshot approvals)
│   ├── src/llm.rs                # SimulatedLLM ou OpenAILLM via reqwest
│   ├── src/fs_safe.rs            # walk_project_files + safe_resolve anti-traversal
│   └── src/main.rs               # HTTP (/api/*) + WebSocket (/ws) em :4000
├── src-tauri/                    # App desktop nativo Tauri v2
│   ├── tauri.conf.json           # Carrega client/dist (prod) ou :5173 (dev)
│   └── src/main.rs               # Inicia o servidor swarm_server embarcado na porta 4000
├── server/                       # Orquestrador Node.js alternativo (ws + tsx)
│   └── demo-project/             # Projeto de exemplo explorado pela IDE
└── client/                       # React + TS + Tailwind + Zustand + Monaco + React Flow
    └── src/components/
        ├── LiveSwarmScreen.tsx   # Tela Única — Enxame ao Vivo (padrão)
        └── SwarmPanel/           # Board (com composer) | Members | Graph
```

## Modos de Visualização

O cabeçalho alterna instantaneamente entre dois modos:

1. **Tela Única (`Enxame ao Vivo` — padrão):** centro de comando onde todos os agentes ficam visíveis simultaneamente:
   - Barra superior com envio de tarefa (`Nova tarefa para o enxame...`) e contadores ao vivo (`trabalhando`, `aguardando`, `aposentados`, aprovações pendentes).
   - Grid de **Agent Live Cards** com anel/ponto verde pulsante durante execução concorrente, destaque âmbar e botões inline **Aprovar / Rejeitar** para aprovações pendentes, pills clicáveis de arquivos em edição (que abrem o arquivo direto no modo IDE) e stream de logs com auto-scroll por agente.
   - Painel inferior dividido entre **Grafo de Comunicação ao Vivo** (`AgentGraph`, acendendo arestas inclusive em `@all`) e **Mural Público** (`Board`, com composer para `@agente` / `@all`).
2. **IDE + Enxame:** layout clássico em 3 colunas (`Explorador` + `Monaco Editor` com badges de edição em tempo real + `SwarmPanel`).

## Como rodar

### Modo Web (Vite + Orquestrador Rust ou Node)

```bash
npm install
npm run dev:rust     # orquestrador Rust em http://localhost:4000 (ws em /ws)
# ou: npm run dev:server  (orquestrador Node.js em :4000)
npm run dev:client   # http://localhost:5173 (proxy /api e /ws -> :4000)
```

### Modo Desktop Nativo (Tauri v2 + Rust)

```bash
npm run run:tauri    # compila client/dist e abre a janela desktop com backend Rust embarcado
npm run build:tauri  # gera build release do app desktop
npm run test:rust    # roda a suíte de testes unitários do server-rust
```

No **Windows PowerShell 5.1** (um comando por linha, sem `&&`):

```powershell
cd "C:\Users\marlo\OneDrive\Imagens\ide agente\swarm-ide"
npm install
npm run dev:rust
# outro terminal:
cd "C:\Users\marlo\OneDrive\Imagens\ide agente\swarm-ide"
npm run dev:client
```

Para buildar/rodar o Tauri no PowerShell 5.1:

```powershell
npm run build -w client
cargo run --manifest-path src-tauri/Cargo.toml
```

## Variáveis de ambiente (server / server-rust)

| Variável | Efeito |
|---|---|
| `PORT` | porta do server (padrão `4000`) |
| `PROJECT_ROOT` | projeto exibido no explorador (padrão `server/demo-project`) |
| `OPENAI_API_KEY` | se definida, agentes usam a API OpenAI real; caso contrário usa `SimulatedLLM` |
| `SWARM_MODEL` | modelo (padrão `gpt-4o-mini`) |
| `SWARM_SIM_DELAY_MS` | atraso simulado por turno no `SimulatedLLM` (padrão `800`) |
| `VITE_API_URL` / `VITE_WS_URL` | override opcional das URLs no client (em Tauri aponta para `127.0.0.1:4000`) |

Sem `OPENAI_API_KEY` o servidor usa `SimulatedLLM`, e o client liga um simulador local interativo após 2.5s caso nenhum orquestrador esteja acessível via WebSocket.

## Protocolo WebSocket

- Client → server: `task:submit`, `board:post`, `approval:respond`, `agent:log`.
- Server → client: `agents`, `board:history`, `board:post`, `edit:indicator`, `edit:clear`, `approval:request`, `agent:log`, `status`. Ver [shared/types.ts](shared/types.ts).
