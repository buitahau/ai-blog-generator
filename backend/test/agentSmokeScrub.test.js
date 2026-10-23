import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';

// Importing the script must not run main(); it is guarded by an argv check.
const { scrub } = await import('../scripts/agent-smoke.js');

describe('scrub', () => {
  it('drops session_id and uuid at any depth', () => {
    const out = scrub({ session_id: 's', uuid: 'u', a: { uuid: 'u', b: [{ session_id: 's', keep: 1 }] } }, {});
    expect(out).toEqual({ a: { b: [{ keep: 1 }] } });
  });

  it('replaces the temp run path with <tmp>', () => {
    const out = scrub({ cwd: `${tmpdir()}/blog-run-AbC123/sub` }, {});
    expect(out.cwd).toBe('<tmp>/sub');
  });

  it('throws on sk-ant- strings', () => {
    expect(() => scrub({ x: 'sk-ant-abc' }, {})).toThrow(/API key/);
  });

  it('throws on the env key value', () => {
    expect(() => scrub({ x: 'has secret123 inside' }, { ANTHROPIC_API_KEY: 'secret123' })).toThrow(/API key/);
  });
});
