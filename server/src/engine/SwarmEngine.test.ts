import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import type { ServerEvent } from '../../../shared/types';
import { SwarmEngine } from './SwarmEngine';
import { SimulatedLLM, type LLMAction, type LLMInput, type LLMProvider } from '../llm/LLMProvider';
import { safeResolve } from '../fsSafe';

describe('SwarmEngine', () => {
  it('wakes all non-author agents on @all', async () => {
    const woken: string[] = [];
    const llm: LLMProvider = {
      async complete(input: LLMInput): Promise<LLMAction> {
        woken.push(input.agent.id);
        return {};
      },
    };

    const engine = new SwarmEngine(llm);
    engine.registerDefaultAgents();

    const post = await engine.post('coordinator', 'Atenção @all, sincronizem o status.');
    assert.deepEqual(post.mentions, ['all']);
    assert.deepEqual(woken.sort(), ['api-worker', 'monitor', 'ui-worker', 'verifier']);
    assert.equal(woken.includes('coordinator'), false);
  });

  it('wakes multiple mentioned workers concurrently', async () => {
    let activeNow = 0;
    let maxConcurrent = 0;
    let seenBothActiveInEngine = false;

    const engineRef: { current?: SwarmEngine } = {};
    const llm: LLMProvider = {
      async complete(input: LLMInput): Promise<LLMAction> {
        activeNow++;
        maxConcurrent = Math.max(maxConcurrent, activeNow);
        await new Promise((resolve) => setTimeout(resolve, 40));

        const agents = engineRef.current?.getAgents() ?? [];
        const ui = agents.find((a) => a.id === 'ui-worker');
        const api = agents.find((a) => a.id === 'api-worker');
        if (ui?.status === 'active' && api?.status === 'active') {
          seenBothActiveInEngine = true;
        }

        activeNow--;
        return { posts: [`${input.agent.name} concluído`] };
      },
    };

    const engine = new SwarmEngine(llm);
    engineRef.current = engine;
    engine.registerDefaultAgents();

    await engine.post('coordinator', 'Frentes: @ui-worker e @api-worker');
    assert.equal(maxConcurrent, 2);
    assert.equal(seenBothActiveInEngine, true);
  });

  it('emits edit:clear when a turn completes', async () => {
    const events: ServerEvent[] = [];
    const llm: LLMProvider = {
      async complete(): Promise<LLMAction> {
        return {
          edits: [{ path: 'src/app.ts', note: 'atualizando componente' }],
        };
      },
    };

    const engine = new SwarmEngine(llm);
    engine.registerDefaultAgents();
    engine.onEvent((evt) => events.push(evt));

    await engine.post('coordinator', '@ui-worker edite o arquivo');

    const indicatorIdx = events.findIndex(
      (e) => e.type === 'edit:indicator' && e.indicator.agentId === 'ui-worker',
    );
    const clearIdx = events.findIndex(
      (e) => e.type === 'edit:clear' && e.agentId === 'ui-worker',
    );

    assert.notEqual(indicatorIdx, -1);
    assert.notEqual(clearIdx, -1);
    assert.ok(clearIdx > indicatorIdx);
  });

  it('pauses on approval:request and resumes on approval:respond (approved & rejected)', async () => {
    const events: ServerEvent[] = [];
    let turnCount = 0;

    const llm: LLMProvider = {
      async complete(): Promise<LLMAction> {
        turnCount++;
        return {
          approval: {
            action: turnCount === 1 ? 'Sobrescrever package.json' : 'Apagar cache',
            filePath: 'server/package.json',
          },
        };
      },
    };

    const engine = new SwarmEngine(llm);
    engine.registerDefaultAgents();
    engine.onEvent((evt) => events.push(evt));

    // Approved flow
    const pendingApprove = new Promise<string>((resolve) => {
      const check = () => {
        const req = events.find(
          (e) => e.type === 'approval:request' && e.request.status === 'pending',
        );
        if (req && req.type === 'approval:request') resolve(req.request.id);
        else setTimeout(check, 5);
      };
      check();
    });

    const firstPost = engine.post('coordinator', '@api-worker execute ação crítica');
    const firstReqId = await pendingApprove;

    const pausedAgent = engine.getAgents().find((a) => a.id === 'api-worker');
    assert.equal(pausedAgent?.status, 'active');
    assert.equal(pausedAgent?.task, '⏸ Aguardando aprovação: Sobrescrever package.json');

    await engine.handleClientEvent({
      type: 'approval:respond',
      requestId: firstReqId,
      approved: true,
    });
    await firstPost;

    assert.ok(
      events.some(
        (e) =>
          e.type === 'approval:request' &&
          e.request.id === firstReqId &&
          e.request.status === 'approved',
      ),
    );
    assert.ok(
      engine.getHistory().some((p) => p.text.includes('✅ Aprovado pelo humano: Sobrescrever package.json')),
    );
    const resumedAgent = engine.getAgents().find((a) => a.id === 'api-worker');
    assert.equal(resumedAgent?.status, 'waiting');
    assert.equal(resumedAgent?.task, null);

    // Rejected flow
    const secondApprove = new Promise<string>((resolve) => {
      const check = () => {
        const req = events.find(
          (e) =>
            e.type === 'approval:request' &&
            e.request.id !== firstReqId &&
            e.request.status === 'pending',
        );
        if (req && req.type === 'approval:request') resolve(req.request.id);
        else setTimeout(check, 5);
      };
      check();
    });

    const secondPost = engine.post('coordinator', '@api-worker tente novamente');
    const secondReqId = await secondApprove;

    await engine.handleClientEvent({
      type: 'approval:respond',
      requestId: secondReqId,
      approved: false,
    });
    await secondPost;

    assert.ok(
      events.some(
        (e) =>
          e.type === 'approval:request' &&
          e.request.id === secondReqId &&
          e.request.status === 'rejected',
      ),
    );
    assert.ok(
      engine.getHistory().some((p) => p.text.includes('⛔ Rejeitado pelo humano: Apagar cache')),
    );
  });

  it('SimulatedLLM briefs workers without @verifier initially and supports delayMs: 0', async () => {
    const sim = new SimulatedLLM({ delayMs: 0 });
    const engine = new SwarmEngine(sim);
    engine.registerDefaultAgents();

    const coordinatorAction = await sim.complete({
      agent: engine.getAgents().find((a) => a.id === 'coordinator')!,
      trigger: {
        id: '1',
        agentId: 'user',
        text: 'Nova tarefa: testar',
        mentions: ['coordinator'],
        ts: Date.now(),
        kind: 'system',
      },
      context: [],
      openTask: 'testar',
    });

    const briefing = coordinatorAction.posts?.[0] ?? '';
    assert.ok(briefing.includes('@ui-worker'));
    assert.ok(briefing.includes('@api-worker'));
    assert.equal(briefing.includes('@verifier'), false);
  });
});

describe('safeResolve', () => {
  const root = path.resolve('demo-project');

  it('resolves valid relative paths inside projectRoot', () => {
    assert.equal(safeResolve(root, 'src/index.ts'), path.join(root, 'src', 'index.ts'));
    assert.equal(safeResolve(root, 'package.json'), path.join(root, 'package.json'));
  });

  it('blocks prefix traversal, parent traversal, null bytes, and hidden files', () => {
    assert.equal(safeResolve(root, '../demo-project-secret'), null);
    assert.equal(safeResolve(root, '../demo-project-secret/secret.txt'), null);
    assert.equal(safeResolve(root, '..'), null);
    assert.equal(safeResolve(root, '../../etc/passwd'), null);
    assert.equal(safeResolve(root, 'src\0.ts'), null);
    assert.equal(safeResolve(root, '.env'), null);
    assert.equal(safeResolve(root, '.git'), null);
    assert.equal(safeResolve(root, '.git/config'), null);
    assert.equal(safeResolve(root, 'nested/.env.local'), null);
    assert.equal(safeResolve(root, 'node_modules/ws/index.js'), null);
    assert.equal(safeResolve(root, ''), null);
  });
});
