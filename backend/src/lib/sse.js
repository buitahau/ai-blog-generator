export function initSse(res) {
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    // Stops nginx-style proxies from buffering the stream.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
}

// Returns false (and writes nothing) once the response is no longer writable,
// so late upstream callbacks can never cause "write after end".
function safeWrite(res, chunk) {
  if (res.writableEnded || res.destroyed) return false;
  // write()'s return value (backpressure) is ignored on purpose: frames are
  // tiny and the upstream rate is bounded by token generation, so Node's
  // internal buffer cannot grow meaningfully.
  res.write(chunk);
  return true;
}

// `id` is optional: when set, EventSource clients resend it as Last-Event-ID on reconnect.
export function sendEvent(res, event, data, id) {
  const idLine = id === undefined || id === null ? '' : `id: ${id}\n`;
  return safeWrite(res, `${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function sendComment(res, text) {
  return safeWrite(res, `: ${text}\n\n`);
}
