import { describe, expect, it } from 'vitest';
import { LENGTH_PRESETS, MAX_TOKENS_CEILING, assertConfig } from '../src/config.js';

describe('config', () => {
  it('keeps every length preset within the max_tokens ceiling', () => {
    for (const preset of Object.values(LENGTH_PRESETS)) {
      expect(preset.maxTokens).toBeLessThanOrEqual(MAX_TOKENS_CEILING);
    }
  });

  it('rejects a missing or blank API key and accepts a set one', () => {
    expect(() => assertConfig({})).toThrow('missing ANTHROPIC_API_KEY');
    expect(() => assertConfig({ ANTHROPIC_API_KEY: '  ' })).toThrow('missing ANTHROPIC_API_KEY');
    expect(() => assertConfig({ ANTHROPIC_API_KEY: 'sk-secret' })).not.toThrow();
  });
});
