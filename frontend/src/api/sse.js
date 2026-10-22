// Pure SSE frame parser. Feed it decoded text chunks; it returns complete
// frames and keeps any trailing partial frame buffered between calls.
export function createSseParser() {
  let buffer = '';

  function parseFrame(raw) {
    let event = 'message';
    const data = [];
    for (const line of raw.split('\n')) {
      if (line === '' || line.startsWith(':')) continue;
      const idx = line.indexOf(':');
      const field = idx === -1 ? line : line.slice(0, idx);
      let value = idx === -1 ? '' : line.slice(idx + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    // Comment-only frames (heartbeats) carry no data and are dropped.
    if (data.length === 0) return null;
    return { event, data: data.join('\n') };
  }

  return {
    push(chunk) {
      buffer += chunk.replace(/\r\n?/g, '\n');
      const parts = buffer.split('\n\n');
      buffer = parts.pop();
      return parts.map(parseFrame).filter(Boolean);
    },
  };
}
