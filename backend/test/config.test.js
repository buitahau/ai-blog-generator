import { describe, expect, it } from 'vitest';
import * as config from '../src/config.js';
import { LENGTH_PRESETS, MAX_TOKENS_CEILING, assertConfig } from '../src/config.js';

const valid = { ANTHROPIC_API_KEY: 'sk-secret', DATABASE_URL: 'postgres://x', ADMIN_TOKEN: 'x'.repeat(32) };

describe('config', () => {
  it('keeps every length preset within the max_tokens ceiling', () => {
    for (const preset of Object.values(LENGTH_PRESETS)) {
      expect(preset.maxTokens).toBeLessThanOrEqual(MAX_TOKENS_CEILING);
    }
  });

  it('rejects a missing or blank API key and accepts a set one', () => {
    expect(() => assertConfig({})).toThrow('missing ANTHROPIC_API_KEY');
    expect(() => assertConfig({ ANTHROPIC_API_KEY: '  ' })).toThrow('missing ANTHROPIC_API_KEY');
    expect(() => assertConfig({ ANTHROPIC_API_KEY: 'sk-secret' })).toThrow('missing DATABASE_URL');
    expect(() => assertConfig({ ANTHROPIC_API_KEY: 'sk-secret', DATABASE_URL: 'postgres://x' })).toThrow('ADMIN_TOKEN');
    expect(() => assertConfig({ ...valid, ADMIN_TOKEN: 'x'.repeat(31) })).toThrow('ADMIN_TOKEN');
    expect(() => assertConfig(valid)).not.toThrow();
  });

  it('defines the orchestrator limits from the requirement', () => {
    expect(config).toMatchObject({
      ORCHESTRATOR_MAX_TURNS: 8,
      ORCHESTRATOR_MAX_BUDGET_USD: 0.25,
      MAX_RESEARCH_SPAWNS: 2,
      MAX_WRITER_SPAWNS: 1,
      RESEARCH_MAX_BUDGET_USD: 1.0,
      WRITER_MAX_BUDGET_USD: 0.5,
      RUN_MAX_BUDGET_USD: 2.75,
      MIN_SPAWN_BUDGET_USD: 0.05,
      RESEARCH_SPAWN_TIMEOUT_MS: 300000,
      WRITER_SPAWN_TIMEOUT_MS: 180000,
      RUN_TIMEOUT_MS: 900000,
      NOTES_MAX_CHARS: 40000,
      MAX_SOURCES: 20,
      RESEARCH_MAX_TURNS: 12,
      WRITER_MAX_TURNS: 2,
    });
    expect(config.PIPELINE_MCP_TIMEOUT_MS).toBe(config.RUN_TIMEOUT_MS + 60000);
    expect(config.PIPELINE_MCP_TIMEOUT_MS).toBeGreaterThan(config.RUN_TIMEOUT_MS);
  });

  it('keeps the worst-case spend within the run budget', () => {
    const worst = config.RESEARCH_MAX_BUDGET_USD * config.MAX_RESEARCH_SPAWNS
      + config.WRITER_MAX_BUDGET_USD + config.ORCHESTRATOR_MAX_BUDGET_USD;
    expect(worst).toBeLessThanOrEqual(config.RUN_MAX_BUDGET_USD);
  });
});
