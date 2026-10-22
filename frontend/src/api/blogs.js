import { readHttpError, safeJson } from './http.js';

const ENDPOINT = '/api/blogs';

async function request(url, signal) {
  let response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  } catch (err) {
    // Let callers distinguish a cancel from a real failure.
    if (signal?.aborted) throw err;
    throw { code: 'NETWORK_ERROR', message: 'Could not reach the server.' };
  }
  if (!response.ok) throw await readHttpError(response);
  const body = safeJson(await response.text().catch(() => ''));
  if (body === undefined) {
    throw { code: 'HTTP_ERROR', message: 'Unexpected response from the server.' };
  }
  return body;
}

/** GET /api/blogs. Rejects with AbortError on cancel, otherwise { code, message, details? }. */
export function listBlogs({ page = 1, pageSize = 10 } = {}, { signal } = {}) {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return request(`${ENDPOINT}?${qs}`, signal);
}

/** GET /api/blogs/:slug. */
export function getBlog(slug, { signal } = {}) {
  return request(`${ENDPOINT}/${encodeURIComponent(slug)}`, signal);
}
