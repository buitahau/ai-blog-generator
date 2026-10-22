import { describe, it, expect } from 'vitest';
import { createSseParser } from './sse.js';

describe('createSseParser', () => {
  it('parses a single frame', () => {
    const p = createSseParser();
    expect(p.push('event: delta\ndata: {"text":"hi"}\n\n')).toEqual([
      { event: 'delta', data: '{"text":"hi"}' },
    ]);
  });

  it('parses a frame split across chunks', () => {
    const p = createSseParser();
    expect(p.push('event: del')).toEqual([]);
    expect(p.push('ta\ndata: {"te')).toEqual([]);
    expect(p.push('xt":"a"}\n')).toEqual([]);
    expect(p.push('\n')).toEqual([{ event: 'delta', data: '{"text":"a"}' }]);
  });

  it('ignores comments', () => {
    const p = createSseParser();
    expect(p.push(': ping\n\n')).toEqual([]);
    expect(p.push(': ping\nevent: start\ndata: {}\n\n')).toEqual([{ event: 'start', data: '{}' }]);
  });

  it('parses multiple events in one chunk', () => {
    const p = createSseParser();
    const out = p.push('event: start\ndata: {}\n\nevent: delta\ndata: {"text":"x"}\n\n');
    expect(out.map((f) => f.event)).toEqual(['start', 'delta']);
  });

  it('joins multi-line data and handles CRLF', () => {
    const p = createSseParser();
    expect(p.push('event: x\r\ndata: a\r\ndata: b\r\n\r\n')).toEqual([{ event: 'x', data: 'a\nb' }]);
  });
});
