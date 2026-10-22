import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callAllowedTool, createTelegramNotifier, redact } from '../src/services/notifier/telegramMcp.js';

const TOKEN = '123456:ABC-def_GHI';
const blog = { id: 'b1', title: 'Hello' };
const config = { botToken: TOKEN, chatId: '42', adminBaseUrl: 'https://admin.example/', timeoutMs: 30 };
const okResult = { content: [{ type: 'text', text: JSON.stringify({ success: true, messageId: 1 }) }] };
const errResult = (text) => ({ isError: true, content: [{ type: 'text', text }] });

let transports, clients, callTool, stderrSpy;

function setup() {
  transports = [];
  clients = [];
  class FakeTransport {
    constructor(opts) {
      this.opts = opts;
      this.stderr = new PassThrough();
      this.close = vi.fn(async () => {});
      transports.push(this);
    }
  }
  class FakeClient {
    constructor() {
      this.connect = vi.fn(async () => {});
      this.callTool = callTool;
      clients.push(this);
    }
  }
  return { ClientClass: FakeClient, TransportClass: FakeTransport, resolveBin: () => '/bin/server.js' };
}

beforeEach(() => {
  callTool = vi.fn(async () => okResult);
  stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('telegram notifier', () => {
  it('sends plain text through send_telegram_text only', async () => {
    const res = await createTelegramNotifier(config, setup()).notify(blog);
    expect(res).toEqual({ status: 'sent' });
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool.mock.calls[0][0]).toEqual({
      name: 'send_telegram_text',
      arguments: { text: 'New draft ready for review: Hello\nhttps://admin.example/admin/blogs?highlight=b1' },
    });
    expect(transports[0].close).toHaveBeenCalled();
  });

  it('truncates text to 4000 characters', async () => {
    await createTelegramNotifier(config, setup()).notify({ id: 'b1', title: 'x'.repeat(5000) });
    expect(callTool.mock.calls[0][0].arguments.text).toHaveLength(4000);
  });

  it('maps Unauthorized and chat not found', async () => {
    callTool.mockResolvedValueOnce(errResult('Error: Unauthorized'));
    expect(await createTelegramNotifier(config, setup()).notify(blog)).toEqual({ status: 'failed', errorCode: 'TELEGRAM_UNAUTHORIZED' });
    callTool.mockResolvedValueOnce(errResult('Error: Bad Request: chat not found'));
    expect(await createTelegramNotifier(config, setup()).notify(blog)).toEqual({ status: 'failed', errorCode: 'TELEGRAM_CHAT_NOT_FOUND' });
    callTool.mockResolvedValueOnce(errResult('Error: boom'));
    expect(await createTelegramNotifier(config, setup()).notify(blog)).toEqual({ status: 'failed', errorCode: 'TELEGRAM_ERROR' });
    expect(callTool).toHaveBeenCalledTimes(3); // results came back: no retry
  });

  it('treats a non-success text result as failed', async () => {
    callTool.mockResolvedValueOnce({ content: [{ type: 'text', text: 'ok?' }] });
    expect(await createTelegramNotifier(config, setup()).notify(blog)).toEqual({ status: 'failed', errorCode: 'TELEGRAM_ERROR' });
  });

  it('times out after one retry on a hang', async () => {
    callTool.mockImplementation(() => new Promise(() => {}));
    const res = await createTelegramNotifier(config, setup()).notify(blog);
    expect(res).toEqual({ status: 'failed', errorCode: 'TELEGRAM_TIMEOUT' });
    expect(callTool).toHaveBeenCalledTimes(2);
    expect(transports).toHaveLength(2);
    transports.forEach((t) => expect(t.close).toHaveBeenCalled());
  });

  it('retries once when the connection fails, then succeeds', async () => {
    callTool.mockRejectedValueOnce(new Error('connection closed')).mockResolvedValueOnce(okResult);
    expect(await createTelegramNotifier(config, setup()).notify(blog)).toEqual({ status: 'sent' });
    expect(callTool).toHaveBeenCalledTimes(2);
  });

  it('never throws, even if the transport cannot be built', async () => {
    const deps = setup();
    deps.resolveBin = () => { throw new Error('cannot resolve'); };
    expect(await createTelegramNotifier(config, deps).notify(blog)).toEqual({ status: 'failed', errorCode: 'TELEGRAM_ERROR' });
  });

  it('skips without starting a transport when env is missing', async () => {
    const deps = setup();
    expect(await createTelegramNotifier({ ...config, botToken: '' }, deps).notify(blog)).toEqual({ status: 'skipped' });
    expect(await createTelegramNotifier({ ...config, chatId: undefined }, deps).notify(blog)).toEqual({ status: 'skipped' });
    expect(transports).toHaveLength(0);
  });

  it('abort stops the call, closes the transport and does not retry', async () => {
    callTool.mockImplementation(() => new Promise(() => {}));
    const ac = new AbortController();
    const p = createTelegramNotifier({ ...config, timeoutMs: 5000 }, setup()).notify(blog, { signal: ac.signal });
    await vi.waitFor(() => expect(callTool).toHaveBeenCalled());
    ac.abort();
    expect(await p).toEqual({ status: 'failed', errorCode: 'TELEGRAM_TIMEOUT' });
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(transports[0].close).toHaveBeenCalled();
  });

  it('does nothing when already aborted', async () => {
    const deps = setup();
    const res = await createTelegramNotifier(config, deps).notify(blog, { signal: AbortSignal.abort() });
    expect(res.status).toBe('failed');
    expect(transports).toHaveLength(0);
  });

  it('only allows send_telegram_text', async () => {
    const client = { callTool: vi.fn() };
    await expect(callAllowedTool(client, 'send_telegram_markdown', { markdown: 'x' })).rejects.toThrow(/not allowed/);
    await expect(callAllowedTool(client, 'send_telegram_buttons', {})).rejects.toThrow(/not allowed/);
    expect(client.callTool).not.toHaveBeenCalled();
  });

  it('starts the server with a minimal env and piped stderr', async () => {
    await createTelegramNotifier(config, setup()).notify(blog);
    const { command, args, env, stderr } = transports[0].opts;
    expect(command).toBe(process.execPath);
    expect(args).toEqual(['/bin/server.js']);
    expect(stderr).toBe('pipe');
    expect(env).toEqual({
      TELEGRAM_BOT_TOKEN: TOKEN,
      TELEGRAM_CHAT_ID: '42',
      LOG_LEVEL: 'WARN',
      LOG_ENABLE_CONSOLE: 'false',
      TELEGRAM_TEXT_TIMEOUT: '1000',
    });
    for (const key of ['DEBUG_MCP', 'ANTHROPIC_API_KEY', 'DATABASE_URL', 'ADMIN_TOKEN']) expect(env).not.toHaveProperty(key);
  });

  it('keeps the server timeout below the notifier timeout, floored at 1 s', async () => {
    const deps = setup();
    await createTelegramNotifier({ ...config, timeoutMs: 10_000 }, deps).notify(blog);
    await createTelegramNotifier({ ...config, timeoutMs: 2000 }, deps).notify(blog);
    expect(transports[0].opts.env.TELEGRAM_TEXT_TIMEOUT).toBe('7000');
    expect(transports[1].opts.env.TELEGRAM_TEXT_TIMEOUT).toBe('1000');
  });

  it('maps a server-side timeout result to TELEGRAM_TIMEOUT without retry', async () => {
    callTool.mockResolvedValueOnce(errResult('Network timeout: request took too long'));
    expect(await createTelegramNotifier(config, setup()).notify(blog)).toEqual({ status: 'failed', errorCode: 'TELEGRAM_TIMEOUT' });
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it('never rejects on a nullish blog', async () => {
    expect(await createTelegramNotifier(config, setup()).notify(null)).toEqual({ status: 'failed', errorCode: 'TELEGRAM_ERROR' });
  });

  it('redacts bot tokens from server stderr before logging', async () => {
    callTool.mockImplementation(async () => {
      transports[0].stderr.write(`GET https://api.telegram.org/bot123:ABC-def/sendMessage failed\n`);
      transports[0].stderr.write(`raw token ${TOKEN} leaked\n`);
      await new Promise((r) => setTimeout(r, 10));
      return okResult;
    });
    await createTelegramNotifier({ ...config, timeoutMs: 1000 }, setup()).notify(blog);
    const logged = stderrSpy.mock.calls.flat().join('\n');
    expect(logged).toContain('bot<redacted>/sendMessage');
    expect(logged).not.toContain('bot123:ABC-def');
    expect(logged).not.toContain(TOKEN);
  });

  it('redact() masks both the bot pattern and the literal token', () => {
    expect(redact('url /bot123:ABC-def/x', TOKEN)).toBe('url /bot<redacted>/x');
    expect(redact(`t=${TOKEN}`, TOKEN)).not.toContain(TOKEN);
  });

  it('does not log the token when an attempt fails', async () => {
    callTool.mockRejectedValue(new Error(`request to bot${TOKEN} failed`));
    await createTelegramNotifier(config, setup()).notify(blog);
    expect(stderrSpy.mock.calls.flat().join('\n')).not.toContain(TOKEN);
  });
});
