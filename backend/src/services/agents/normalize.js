import { categoryFromApiFailure } from './runAgentQuery.js';

// Maps raw Agent SDK messages to the compact run events defined in B10.
// Raw tool output and error text never leave this module: results are reduced to
// {title, url, snippet?} items and a short summary, and failures to a fixed errorCode.

const MAX_EVENT_BYTES = 4000;
const MAX_RESULTS = 10;
const MAX_SNIPPET = 200;
const MAX_TITLE = 120;
const MAX_URL = 500;
const MAX_SOURCES = 20;
const TRACKED_TOOLS = new Set(['WebSearch', 'WebFetch']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const isHttpUrl = (u) => typeof u === 'string' && u.length <= MAX_URL && /^https?:\/\//i.test(u);

function searchHits(output) {
  const hits = [];
  if (!Array.isArray(output?.results)) return hits;
  for (const group of output.results) {
    if (!isObj(group) || !Array.isArray(group.content)) continue;
    for (const hit of group.content) {
      if (isObj(hit) && isHttpUrl(hit.url)) hits.push(hit);
    }
  }
  return hits;
}

function toResultItems(hits) {
  return hits.slice(0, MAX_RESULTS).map((hit) => {
    const item = { title: str(hit.title, MAX_TITLE) || hit.url, url: hit.url };
    const snippet = str(hit.snippet, MAX_SNIPPET);
    if (snippet) item.snippet = snippet;
    return item;
  });
}

function describeResult(name, output) {
  if (name === 'WebSearch') {
    const results = toResultItems(searchHits(output));
    return { results, summary: `${results.length} result${results.length === 1 ? '' : 's'}` };
  }
  if (isObj(output) && typeof output.code === 'number') {
    const host = isHttpUrl(output.url) ? output.url : '';
    const fetched = host ? `Fetched ${host}` : 'Fetched';
    return { summary: `${fetched} (HTTP ${output.code}, ${Number(output.bytes) || 0} bytes)` };
  }
  return {};
}

// Hard guarantee for the ~4 KB event budget, whatever the SDK sent.
function capSize(event) {
  const size = () => Buffer.byteLength(JSON.stringify(event));
  while (size() > MAX_EVENT_BYTES && event.results?.length) event.results.pop();
  if (size() > MAX_EVENT_BYTES && typeof event.text === 'string') {
    event.text = event.text.slice(0, Math.max(0, event.text.length - (size() - MAX_EVENT_BYTES)));
    // Slicing may leave half a surrogate pair at the end.
    if (/[\uD800-\uDBFF]$/.test(event.text)) event.text = event.text.slice(0, -1);
  }
  if (size() > MAX_EVENT_BYTES && event.input) event.input = {};
  return event;
}

export function createNormalizer(agent) {
  const pending = new Map(); // toolUseId -> name, for calls still awaiting a result

  function handleStreamEvent(message) {
    if (message.parent_tool_use_id) return [];
    const ev = message.event;
    if (ev?.type !== 'content_block_delta' || ev.delta?.type !== 'text_delta') return [];
    if (typeof ev.delta.text !== 'string' || !ev.delta.text) return [];
    return [{ type: 'agent_text_delta', agent, text: ev.delta.text }];
  }

  function handleAssistant(message) {
    const events = [];
    if (message.error) {
      events.push({ type: 'agent_status', agent, state: 'failed', category: categoryFromApiFailure(undefined, message.error) });
    }
    const content = message.message?.content;
    if (!Array.isArray(content)) return events;
    for (const block of content) {
      if (!isObj(block) || block.type !== 'tool_use') continue;
      if (!TRACKED_TOOLS.has(block.name) || typeof block.id !== 'string' || pending.has(block.id)) continue;
      const input = isObj(block.input) ? block.input : {};
      const shaped = block.name === 'WebSearch' ? { query: str(input.query, 500) } : { url: str(input.url, 1000) };
      pending.set(block.id, block.name);
      events.push({ type: 'tool_call', agent, toolUseId: block.id, name: block.name, input: shaped });
    }
    return events;
  }

  function handleUser(message) {
    const content = message.message?.content;
    if (!Array.isArray(content)) return [];
    const events = [];
    for (const block of content) {
      if (!isObj(block) || block.type !== 'tool_result') continue;
      const name = pending.get(block.tool_use_id);
      if (!name) continue; // untracked tool, or a duplicate result
      pending.delete(block.tool_use_id);
      const event = { type: 'tool_result', agent, toolUseId: block.tool_use_id, name };
      if (block.is_error === true) {
        events.push({ ...event, ok: false, errorCode: 'TOOL_ERROR' });
        continue;
      }
      const output = message.tool_use_result;
      // HTTP failures can arrive without is_error; keep this in line with collectSources.
      if (name === 'WebFetch' && isObj(output) && typeof output.code === 'number' && output.code >= 400) {
        events.push({ ...event, ok: false, errorCode: 'HTTP_ERROR', ...describeResult(name, output) });
        continue;
      }
      events.push({ ...event, ok: true, ...describeResult(name, output) });
    }
    return events;
  }

  function normalize(message) {
    try {
      if (!isObj(message)) return [];
      let events = [];
      switch (message.type) {
        case 'stream_event': events = handleStreamEvent(message); break;
        case 'assistant': events = handleAssistant(message); break;
        case 'user': events = handleUser(message); break;
        case 'tool_progress':
          events = [{
            type: 'agent_heartbeat', agent,
            toolName: str(message.tool_name, 100),
            elapsedSec: Math.max(0, Math.round(Number(message.elapsed_time_seconds) || 0)),
          }];
          break;
        case 'system':
          if (message.subtype === 'api_retry') {
            events = [{
              type: 'agent_status', agent, state: 'retrying',
              category: categoryFromApiFailure(message.error_status, message.error), attempt: Number(message.attempt) || 0,
            }];
          } else if (message.subtype === 'init') {
            console.debug('Agent session init ignored.');
          }
          break;
        default: break;
      }
      return events.map(capSize);
    } catch (err) {
      console.error('Failed to normalize agent message:', err);
      return [];
    }
  }

  // Closes calls that never got a result (e.g. the run was aborted mid-tool).
  normalize.flush = () => {
    const events = [...pending].map(([toolUseId, name]) => (
      { type: 'tool_result', agent, toolUseId, name, ok: false, errorCode: 'NO_RESULT' }
    ));
    pending.clear();
    return events;
  };

  return normalize;
}

export function collectSources(messages) {
  const seen = new Map();
  const add = (title, url) => {
    if (seen.size < MAX_SOURCES && isHttpUrl(url) && !seen.has(url)) {
      seen.set(url, { title: str(title, MAX_TITLE) || url, url });
    }
  };
  try {
    for (const message of messages ?? []) {
      if (!isObj(message) || message.type !== 'user') continue;
      const output = message.tool_use_result;
      if (!isObj(output)) continue;
      for (const hit of searchHits(output)) add(hit.title, hit.url);
      if (typeof output.code === 'number' && output.code < 400) add(undefined, output.url);
    }
  } catch (err) {
    console.error('Failed to collect sources:', err);
  }
  return [...seen.values()];
}
