// Manual smoke test: node scripts/agent-smoke.js "topic" [--record <name>] [--agent researcher|writer]
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAgentQuery } from '../src/services/agents/runAgentQuery.js';
import {
  RESEARCH_MAX_TURNS, RESEARCH_MAX_BUDGET_USD, WRITER_MAX_TURNS, WRITER_MAX_BUDGET_USD,
} from '../src/config.js';

// Placeholder agents until the real definitions land (B08).
const AGENTS = {
  researcher: {
    description: 'Researches a topic on the web.',
    prompt: 'Research the topic briefly using web search and reply with short bullet notes.',
    tools: ['WebSearch', 'WebFetch'],
  },
  writer: {
    description: 'Writes a short post.',
    prompt: 'Write a short Markdown post on the given topic.',
    tools: [],
  },
};
const LIMITS = {
  researcher: { maxTurns: RESEARCH_MAX_TURNS, maxBudgetUsd: RESEARCH_MAX_BUDGET_USD },
  writer: { maxTurns: WRITER_MAX_TURNS, maxBudgetUsd: WRITER_MAX_BUDGET_USD },
};

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'agent');

export function scrub(value, env = process.env) {
  const tmpRe = new RegExp(`${tmpdir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/blog-run-[A-Za-z0-9]+`, 'g');
  const drop = (v) => {
    if (Array.isArray(v)) return v.map(drop);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v).filter(([k]) => k !== 'session_id' && k !== 'uuid').map(([k, x]) => [k, drop(x)]),
      );
    }
    return typeof v === 'string' ? v.replace(tmpRe, '<tmp>') : v;
  };
  const out = drop(value);
  const text = JSON.stringify(out);
  const key = env.ANTHROPIC_API_KEY;
  if (text.includes('sk-ant-') || (key && text.includes(key))) {
    throw new Error('Refusing to write fixture: it contains an API key.');
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const take = (flag) => {
    const i = args.indexOf(flag);
    return i === -1 ? undefined : args.splice(i, 2)[1];
  };
  const record = take('--record');
  const agentName = take('--agent') ?? 'researcher';
  const prompt = args[0] ?? 'test';
  if (!AGENTS[agentName]) throw new Error(`Unknown agent: ${agentName}`);

  const messages = [];
  try {
    const res = await runAgentQuery({
      agentName,
      agents: AGENTS,
      prompt,
      limits: LIMITS[agentName],
      signal: AbortSignal.timeout(120_000),
      onMessage: (m) => { messages.push(m); },
    });
    console.log(`subtype=${res.subtype} cost=$${res.totalCostUsd} turns=${res.numTurns}`);
  } finally {
    // Error runs (e.g. success with is_error) are worth recording too.
    if (record) {
      await mkdir(FIXTURE_DIR, { recursive: true });
      const lines = messages.map((m) => JSON.stringify(scrub(m))).join('\n') + '\n';
      await writeFile(path.join(FIXTURE_DIR, `${record}.jsonl`), lines);
      console.log(`Wrote test/fixtures/agent/${record}.jsonl`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(err.code ?? '', err.message); process.exit(1); });
}
