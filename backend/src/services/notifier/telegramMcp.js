import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { TELEGRAM_NOTIFY_TIMEOUT_MS } from '../../config.js';

const TOOL = 'send_telegram_text';
const TEXT_MAX = 4000;
const TOKEN_PATTERN = /bot\d+:[\w-]+/g;

export const redact = (text, token) => {
  let out = String(text).replace(TOKEN_PATTERN, 'bot<redacted>');
  if (token) out = out.split(token).join('<redacted>');
  return out;
};

// The server exposes more tools (markdown, buttons, ...); only plain text is allowed here.
export async function callAllowedTool(client, name, args, options) {
  if (name !== TOOL) throw new Error(`Tool not allowed: ${name}`);
  return client.callTool({ name, arguments: args }, undefined, options);
}

export function buildText(blog, adminBaseUrl) {
  const base = (adminBaseUrl ?? '').replace(/\/+$/, '');
  const link = base ? `\n${base}/admin/blogs?highlight=${blog.id}` : '';
  return `New draft ready for review: ${blog.title}${link}`.slice(0, TEXT_MAX);
}

function mapToolResult(result) {
  const text = (result?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  if (!result?.isError) {
    try {
      if (JSON.parse(text)?.success === true) return { status: 'sent' };
    } catch { /* non-JSON text is not a success */ }
    return { status: 'failed', errorCode: 'TELEGRAM_ERROR' };
  }
  if (/unauthorized/i.test(text)) return { status: 'failed', errorCode: 'TELEGRAM_UNAUTHORIZED' };
  if (/chat not found/i.test(text)) return { status: 'failed', errorCode: 'TELEGRAM_CHAT_NOT_FOUND' };
  if (/timeout/i.test(text)) return { status: 'failed', errorCode: 'TELEGRAM_TIMEOUT' };
  return { status: 'failed', errorCode: 'TELEGRAM_ERROR' };
}

// The server must give up on Telegram before our timer does; otherwise we could retry a
// message that was in fact delivered. Its default is 10 s, so short budgets need a lower value.
const SERVER_MARGIN_MS = 3000;
const SERVER_MIN_TIMEOUT_MS = 1000;
export const serverTimeoutFor = (timeoutMs) => Math.max(SERVER_MIN_TIMEOUT_MS, Math.floor(timeoutMs) - SERVER_MARGIN_MS);

class NoResultError extends Error {
  constructor(code, cause) {
    super(code);
    this.code = code;
    this.cause = cause;
  }
}

export function createTelegramNotifier(config = {}, deps = {}) {
  const {
    botToken,
    chatId,
    adminBaseUrl,
    timeoutMs = TELEGRAM_NOTIFY_TIMEOUT_MS,
  } = config;
  const {
    ClientClass = Client,
    TransportClass = StdioClientTransport,
    resolveBin = () => createRequire(import.meta.url).resolve('telegram-chat-bot-mcp'),
  } = deps;

  async function attempt(text, signal) {
    const transport = new TransportClass({
      command: process.execPath,
      args: [resolveBin()],
      env: {
        TELEGRAM_BOT_TOKEN: botToken,
        TELEGRAM_CHAT_ID: chatId,
        LOG_LEVEL: 'WARN',
        // The server's logger writes to stdout, which is the MCP JSON-RPC channel.
        LOG_ENABLE_CONSOLE: 'false',
        TELEGRAM_TEXT_TIMEOUT: String(serverTimeoutFor(timeoutMs)),
      },
      stderr: 'pipe',
    });
    let lines;
    if (transport.stderr) {
      lines = createInterface({ input: transport.stderr });
      lines.on('line', (line) => console.error('telegram-mcp:', redact(line, botToken)));
      transport.stderr.on?.('error', () => {});
    }

    const controller = new AbortController();
    let timer;
    let onParentAbort;
    const stop = new Promise((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(
        new NoResultError(signal?.aborted ? 'ABORTED' : 'TELEGRAM_TIMEOUT'),
      ), { once: true });
      timer = setTimeout(() => controller.abort(), timeoutMs);
      onParentAbort = () => controller.abort();
      if (signal?.aborted) controller.abort();
      else signal?.addEventListener('abort', onParentAbort, { once: true });
    });
    stop.catch(() => {});

    try {
      const client = new ClientClass({ name: 'blog-generator-notifier', version: '1.0.0' });
      const work = (async () => {
        await client.connect(transport);
        return callAllowedTool(client, TOOL, { text }, { signal: controller.signal, timeout: timeoutMs });
      })();
      work.catch(() => {});
      const result = await Promise.race([work, stop]);
      return mapToolResult(result);
    } catch (err) {
      if (err instanceof NoResultError) throw err;
      throw new NoResultError('TELEGRAM_ERROR', err);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onParentAbort);
      lines?.close();
      try { await transport.close(); } catch { /* already closed */ }
    }
  }

  return {
    // Never throws: callers only get a status so a notification can not fail a run.
    async notify(blog, { signal } = {}) {
      if (!botToken || !chatId) return { status: 'skipped' };
      if (signal?.aborted) return { status: 'failed', errorCode: 'TELEGRAM_TIMEOUT' };
      let lastCode = 'TELEGRAM_ERROR';
      // One retry only when no result came back, so a delivered message is never duplicated.
      for (let i = 0; i < 2; i += 1) {
        // The parent may abort while the previous attempt is still closing.
        if (signal?.aborted) return { status: 'failed', errorCode: 'TELEGRAM_TIMEOUT' };
        try {
          const text = buildText(blog, adminBaseUrl);
          return await attempt(text, signal);
        } catch (err) {
          const code = err?.code ?? 'TELEGRAM_ERROR';
          console.error('Telegram notification attempt failed:', code, redact(err?.cause?.message ?? '', botToken));
          if (code === 'ABORTED') return { status: 'failed', errorCode: 'TELEGRAM_TIMEOUT' };
          lastCode = code;
        }
      }
      return { status: 'failed', errorCode: lastCode };
    },
  };
}
