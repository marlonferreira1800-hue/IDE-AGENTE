import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { Agent, BoardPost } from '../../../shared/types';

// ---------------------------------------------------------------------------
// Contrato do provedor de LLM. O SwarmEngine conversa apenas com esta
// interface, então qualquer provedor (OpenAI, Anthropic, Ollama...) plugável.
// ---------------------------------------------------------------------------

export interface LLMInput {
  agent: Agent;
  /** post que acordou o agente */
  trigger: BoardPost;
  /** últimas mensagens do mural (contexto) */
  context: BoardPost[];
  openTask: string | null;
}

export interface LLMAction {
  /** mensagens para publicar no Board (podem conter @menções) */
  posts?: string[];
  /** arquivos que o agente está editando agora (vira indicador no Monaco) */
  edits?: Array<{ path: string; note: string }>;
  /** ação que exige aprovação humana antes de prosseguir */
  approval?: { action: string; filePath?: string; command?: string };
  retire?: boolean;
  completeTask?: boolean;
}

export interface LLMProvider {
  complete(input: LLMInput): Promise<LLMAction>;
}

/**
 * Se OPENAI_API_KEY estiver configurada, usa o Vercel AI SDK (agnóstico de
 * provedor — basta trocar o modelo). Sem chave, cai no SimulatedLLM, que roda
 * um fluxo determinístico para a demo funcionar out-of-the-box.
 */
export function createLLMProvider(): LLMProvider {
  if (process.env.OPENAI_API_KEY) {
    return new VercelLLM(process.env.SWARM_MODEL ?? 'gpt-4o-mini');
  }
  console.warn('[llm] OPENAI_API_KEY ausente — rodando com SimulatedLLM (demo).');
  return new SimulatedLLM();
}

// ---------------------------------------------------------------------------
// Vercel AI SDK (produção)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Você é um agente de um enxame (swarm) dentro de uma IDE.
Responda SEMPRE com um único objeto JSON (sem texto fora do JSON) no formato:
{
  "posts": ["mensagem para o mural, pode usar @nome para acordar outro agente"],
  "edits": [{ "path": "caminho/do/arquivo", "note": "descrição curta" }],
  "approval": { "action": "descrição", "filePath": "opcional", "command": "opcional" },
  "retire": false,
  "completeTask": false
}
Regras: só inclua os campos necessários; omita "posts" se não houver nada a dizer.
Para acordar outro agente use @id no texto (ex: @verifier). "completeTask" só quando a tarefa foi concluída de verdade.`;

class VercelLLM implements LLMProvider {
  constructor(private model: string) {}

  async complete(input: LLMInput): Promise<LLMAction> {
    const contextText = input.context
      .map((p) => `${p.agentId} [${p.kind}]: ${p.text}`)
      .join('\n');
    const { text } = await generateText({
      model: openai(this.model),
      system: `${SYSTEM_PROMPT}\n\nSeu papel: ${input.agent.role}. Seu id: ${input.agent.id}.`,
      prompt: `Tarefa em aberto: ${input.openTask ?? '(nenhuma)'}\n\nMural (cronológico):\n${contextText}\n\nGatilho que te acordou (${input.trigger.agentId}): ${input.trigger.text}\n\nSua resposta JSON:`,
    });
    return parseAction(text);
  }
}

function parseAction(text: string): LLMAction {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[1] ?? match[0]);
    return {
      posts: Array.isArray(parsed.posts) ? parsed.posts.map(String) : undefined,
      edits: Array.isArray(parsed.edits) ? parsed.edits : undefined,
      approval: parsed.approval ?? undefined,
      retire: parsed.retire === true ? true : undefined,
      completeTask: parsed.completeTask === true ? true : undefined,
    };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// SimulatedLLM (demo sem chave de API): fluxo determinístico por papel.
// ---------------------------------------------------------------------------

export interface SimulatedLLMOptions {
  delayMs?: number;
}

export class SimulatedLLM implements LLMProvider {
  private turns = new Map<string, number>();
  private delayMs: number;

  constructor(options: SimulatedLLMOptions = {}) {
    const envDelay = process.env.SWARM_SIM_DELAY_MS;
    const parsedEnv = envDelay !== undefined ? Number(envDelay) : NaN;
    this.delayMs =
      options.delayMs ?? (Number.isFinite(parsedEnv) && parsedEnv >= 0 ? parsedEnv : 800);
  }

  async complete(input: LLMInput): Promise<LLMAction> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    const { agent, trigger, openTask } = input;
    const n = (this.turns.get(agent.id) ?? 0) + 1;
    this.turns.set(agent.id, n);

    switch (agent.role) {
      case 'coordinator': {
        const task = openTask ?? trigger.text;
        return {
          posts: [
            `📋 Briefing da tarefa: "${task}". Dividindo em frentes — @ui-worker cuida do painel (UI) e @api-worker cuida do orquestrador (API).`,
          ],
        };
      }
      case 'worker': {
        const isUi = agent.id.includes('ui');
        const file = isUi
          ? 'client/src/components/SwarmPanel/SwarmPanel.tsx'
          : 'server/src/engine/SwarmEngine.ts';
        const action: LLMAction = {
          posts: [
            `🔧 ${agent.name} editando \`${file}\` e reportando no mural. @verifier, valide o diff quando eu terminar.`,
          ],
          edits: [{ path: file, note: `${agent.name} editando...` }],
        };
        if (n === 1 && !isUi) {
          action.approval = {
            action: 'Sobrescrever arquivo crítico',
            filePath: 'server/package.json',
          };
        }
        return action;
      }
      case 'verifier': {
        if (!openTask) return {};
        return {
          posts: [
            '✅ Verificação concluída: diffs consistentes, sem quebras aparentes. @coordinator pode encerrar a tarefa. @all bom trabalho.',
          ],
          completeTask: true,
        };
      }
      case 'monitor':
      default:
        return {};
    }
  }
}
