// Throwaway spike (B01): node scripts/orchestrator-spike.js [q1 q2 ...]  (default: all). Needs ANTHROPIC_API_KEY.
import 'dotenv/config';
import { createSdkMcpServer, tool, query } from '@anthropic-ai/claude-agent-sdk';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { z } from 'zod';
import { MODEL } from '../src/config.js';
import { runAgentQuery } from '../src/services/agents/runAgentQuery.js';
import { AGENTS } from '../src/services/agents/definitions.js';

const MCP = ['mcp__pipeline__spawn_researcher', 'mcp__pipeline__spawn_writer'];
const DISALLOWED = [
  'Bash', 'BashOutput', 'KillShell', 'Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit',
  'Glob', 'Grep', 'Task', 'Agent', 'TodoWrite', 'SlashCommand', 'Skill',
  'ListMcpResourcesTool', 'ReadMcpResourceTool', 'ReadMcpResourceDirTool', 'ToolSearch',
];
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (s) => ({ content: [{ type: 'text', text: s }] });

// SPIKE_AUTH=subscription: use the local Claude Code login instead of an API key / gateway.
const SUBSCRIPTION = process.env.SPIKE_AUTH === 'subscription';
const SUB_ENV = SUBSCRIPTION ? { CLAUDE_CONFIG_DIR: path.join(process.env.HOME, '.claude') } : {};
if (SUBSCRIPTION) {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_BASE_URL;
}

function env(cwd) {
  if (SUBSCRIPTION) return { PATH: process.env.PATH, HOME: cwd, ...SUB_ENV };
  const e = { PATH: process.env.PATH, HOME: cwd, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
  if (process.env.ANTHROPIC_BASE_URL) e.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL;
  return e;
}

// Runs the orchestrator with a server built by makeServer(); returns the message list.
async function orchestrate({ prompt, makeServer, agentMode = 'tools-empty', abortController = new AbortController(), serverOpts, maxTurns = 4 }) {
  const cwd = await mkdtemp(path.join(tmpdir(), 'spike-'));
  const server = createSdkMcpServer({ name: 'pipeline', alwaysLoad: true, ...serverOpts, tools: makeServer() });
  const system = 'You are a test orchestrator. Use the pipeline tools exactly as the user says. Be terse.';
  const base = {
    model: MODEL, tools: [], allowedTools: MCP, disallowedTools: DISALLOWED, permissionMode: 'dontAsk',
    settingSources: [], strictMcpConfig: true, mcpServers: { pipeline: server }, persistSession: false,
    cwd, env: env(cwd), maxTurns, maxBudgetUsd: 0.5, abortController,
    stderr: (d) => console.error('[stderr]', String(d).trim()),
  };
  const options = { ...base };
  if (agentMode === 'system') options.systemPrompt = system;
  else {
    options.agent = 'orchestrator';
    options.agents = { orchestrator: { description: 'orch', prompt: system, tools: agentMode === 'tools-mcp' ? MCP : [], model: MODEL } };
  }
  const messages = [];
  let error;
  try {
    for await (const m of query({ prompt, options })) {
      messages.push(m);
      if (m.type === 'system' && m.subtype === 'init') log('init.tools =', JSON.stringify(m.tools));
      else if (m.type === 'assistant') {
        for (const b of m.message.content) {
          if (b.type === 'tool_use') log('assistant tool_use', b.name, JSON.stringify(b.input));
          else if (b.type === 'text') log('assistant text:', b.text.slice(0, 120));
        }
      } else if (m.type === 'user') log('user msg:', JSON.stringify(m.message.content).slice(0, 400));
      else if (m.type === 'result') log('result', m.subtype, 'is_error=', m.is_error, 'turns=', m.num_turns, 'cost=', m.total_cost_usd);
      else log('msg', m.type, m.subtype ?? '');
    }
  } catch (err) {
    error = err;
    log('stream threw:', err.message);
  } finally {
    await rm(cwd, { recursive: true, force: true }).catch(() => {});
  }
  return { messages, error };
}

const researcherTool = (handler) => tool('spawn_researcher', 'Run a research pass.', { focus: z.string().max(150).optional() }, handler);
const writerTool = (handler) => tool('spawn_writer', 'Write the post.', {}, handler);
const echoTools = () => [researcherTool(async () => text('{"ok":true}')), writerTool(async () => text('{"ok":true}'))];

const SCENARIOS = {
  async q1() {
    log('createSdkMcpServer:', typeof createSdkMcpServer, 'tool:', typeof tool);
  },

  async q2() {
    await orchestrate({ prompt: 'Reply with the single word OK. Call no tools.', makeServer: echoTools, agentMode: 'system', maxTurns: 1 });
  },

  async q3() {
    for (const agentMode of ['tools-mcp', 'tools-empty']) {
      log(`--- agent mode: ${agentMode}`);
      await orchestrate({ prompt: 'Reply with the single word OK. Call no tools.', makeServer: echoTools, agentMode, maxTurns: 1 });
    }
  },

  // q4 also covers q9 (tool_result shape): the nested run happens inside the handler.
  async q4() {
    let handlerStarted = 0;
    await orchestrate({
      prompt: 'Call spawn_researcher once with focus "WebAssembly runtimes", then say DONE.',
      agentMode: 'system',
      makeServer: () => [
        researcherTool(async (args, extra) => {
          handlerStarted = Date.now();
          log('handler start, args=', JSON.stringify(args), 'extra.signal?', extra?.signal instanceof AbortSignal);
          const res = await runAgentQuery({
            agentName: 'researcher', agents: AGENTS, prompt: `Research briefly: ${args.focus ?? 'AI'}. Max 2 searches.`,
            limits: { maxTurns: 3, maxBudgetUsd: 0.3 }, signal: extra?.signal, extraEnv: SUB_ENV,
            onMessage: (m) => { if (m.type === 'system' && m.subtype === 'init') log('  nested init.tools =', JSON.stringify(m.tools)); },
          }).catch((e) => { log('  nested threw', e.code ?? '', e.message); return { resultText: 'nested failed', numTurns: 0, totalCostUsd: 0 }; });
          log(`handler done after ${Date.now() - handlerStarted}ms turns=${res.numTurns} cost=${res.totalCostUsd}`);
          return text(JSON.stringify({ ok: true, chars: res.resultText.length }));
        }),
        writerTool(async () => text('{"ok":true}')),
      ],
    });
  },

  async q5() {
    let finished = false;
    await orchestrate({
      prompt: 'Call spawn_researcher once, then report what the tool returned verbatim.',
      agentMode: 'system',
      serverOpts: { timeout: 2000 },
      makeServer: () => [
        researcherTool(async () => { log('handler start (5s sleep)'); await sleep(5000); finished = true; log('handler finished'); return text('{"ok":true}'); }),
        writerTool(async () => text('{}')),
      ],
    });
    await sleep(4000);
    log('handler kept running to completion:', finished);
  },

  async q6() {
    const ac = new AbortController();
    const nestedAc = new AbortController();
    let sigFired = false;
    let nestedErr;
    const run = orchestrate({
      prompt: 'Call spawn_researcher once with focus "quantum computing", then say DONE.',
      agentMode: 'system',
      abortController: ac,
      makeServer: () => [
        researcherTool(async (args, extra) => {
          extra?.signal?.addEventListener('abort', () => { sigFired = true; log('extra.signal FIRED'); });
          // Nested query gets the run signal (not extra.signal) to answer "does it stop when given the run signal".
          const nested = runAgentQuery({
            agentName: 'researcher', agents: AGENTS, prompt: 'Research quantum computing news. Use several searches.',
            limits: { maxTurns: 6, maxBudgetUsd: 0.5 }, signal: nestedAc.signal, extraEnv: SUB_ENV,
          }).catch((e) => { nestedErr = e; log('nested ended:', e.name, e.message); });
          await nested;
          return text('{"ok":true}');
        }),
        writerTool(async () => text('{}')),
      ],
    });
    await sleep(15_000);
    log('aborting parent AND nested run signal');
    ac.abort();
    nestedAc.abort();
    await run;
    await sleep(3000);
    log('extra.signal fired:', sigFired, 'nested error:', nestedErr?.name);
    log('ps:\n' + sh("ps -ef | grep -i '[c]laude' | grep -v orchestrator-spike || echo '(no claude processes)'"));
  },

  async q7() {
    let active = 0;
    let peak = 0;
    await orchestrate({
      prompt: 'In ONE turn, call spawn_researcher twice in parallel (focus "a" and focus "b"). Then say DONE.',
      agentMode: 'system',
      makeServer: () => [
        researcherTool(async (args) => {
          active++; peak = Math.max(peak, active);
          log('handler start', args.focus, 'active=', active);
          await sleep(3000);
          active--; log('handler end', args.focus);
          return text('{"ok":true}');
        }),
        writerTool(async () => text('{}')),
      ],
    });
    log('peak concurrent handlers:', peak);
  },

  async q8() {
    for (const mode of ['throw', 'isError']) {
      log(`--- handler ${mode}`);
      await orchestrate({
        prompt: 'Call spawn_researcher once. Then tell me in one sentence whether it worked and what error text, if any, it gave you.',
        agentMode: 'system',
        makeServer: () => [
          researcherTool(async () => {
            if (mode === 'throw') throw new Error('INTERNAL-DETAIL-4711 boom');
            return { isError: true, ...text('{"ok":false,"errorCode":"UPSTREAM_ERROR"}') };
          }),
          writerTool(async () => text('{}')),
        ],
      });
    }
  },

  async q10() {
    for (const name of ['researcher', 'writer']) {
      log(`--- ${name}`);
      await runAgentQuery({
        agentName: name, agents: AGENTS, prompt: 'Say OK. Do not use tools.', limits: { maxTurns: 1, maxBudgetUsd: 0.2 }, extraEnv: SUB_ENV,
        onMessage: (m) => { if (m.type === 'system' && m.subtype === 'init') log('init.tools =', JSON.stringify(m.tools)); },
      }).catch((e) => log('threw', e.code, e.message));
    }
  },

  async q11() {
    let called = 0;
    const long = 'wasm runtime performance comparison and benchmarks '.repeat(5).slice(0, 220).trim();
    await orchestrate({
      prompt: `Call spawn_researcher once with focus set to this text: ${long}. Afterwards tell me in one sentence what the tool returned, including any error text.`,
      agentMode: 'system',
      makeServer: () => [
        researcherTool(async () => { called++; log('HANDLER CALLED'); return text('{"ok":true}'); }),
        writerTool(async () => text('{}')),
      ],
    });
    log('handler calls:', called);
  },

  async q12() {
    for (const [label, limits] of [['error_max_turns', { maxTurns: 1, maxBudgetUsd: 0.5 }], ['error_max_budget_usd', { maxTurns: 6, maxBudgetUsd: 0.0001 }]]) {
      log(`--- ${label}`);
      const cwd = await mkdtemp(path.join(tmpdir(), 'spike-'));
      let gotResult = false;
      try {
        for await (const m of query({
          prompt: 'Search the web for the latest Node.js release, then summarize it in a paragraph.',
          options: {
            agent: 'researcher', agents: { researcher: AGENTS.researcher }, model: MODEL, tools: ['WebSearch', 'WebFetch'],
            allowedTools: ['WebSearch', 'WebFetch'], disallowedTools: DISALLOWED, permissionMode: 'dontAsk', settingSources: [],
            strictMcpConfig: true, persistSession: false, cwd, env: env(cwd), ...limits,
            stderr: (d) => console.error('[stderr]', String(d).trim()),
          },
        })) {
          if (m.type === 'result') { gotResult = true; log('result', m.subtype, 'is_error=', m.is_error, 'cost=', m.total_cost_usd); }
        }
        log('stream ended cleanly after result:', gotResult);
      } catch (err) {
        log(`stream THREW after result=${gotResult}:`, err.message);
      } finally {
        await rm(cwd, { recursive: true, force: true }).catch(() => {});
      }
    }
  },
};

function sh(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', shell: '/bin/bash' }).trim(); } catch (e) { return String(e.stdout ?? e.message).trim(); }
}

async function main() {
  if (!SUBSCRIPTION && !process.env.ANTHROPIC_API_KEY?.trim()) throw new Error('ANTHROPIC_API_KEY is required (backend/.env).');
  const want = process.argv.slice(2);
  const names = want.length ? want : Object.keys(SCENARIOS);
  for (const n of names) {
    if (!SCENARIOS[n]) throw new Error(`Unknown scenario ${n}`);
    console.log(`\n===== ${n} =====`);
    await SCENARIOS[n]();
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
