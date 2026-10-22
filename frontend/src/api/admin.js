import { clearToken, getToken } from './auth.js';
import { readHttpError, safeJson } from './http.js';

/**
 * Authenticated JSON request to an admin endpoint. On 401 it clears the token and
 * rejects with { code: 'UNAUTHORIZED', message }; redirecting is the guard's job.
 */
export async function adminRequest(url, { method = 'GET', body, signal } = {}) {
  const headers = { Accept: 'application/json', Authorization: `Bearer ${getToken() ?? ''}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw { code: 'NETWORK_ERROR', message: 'Could not reach the server.' };
  }
  if (response.status === 401) {
    clearToken();
    throw { code: 'UNAUTHORIZED', message: (await readHttpError(response)).message };
  }
  if (!response.ok) throw await readHttpError(response);
  const text = await response.text().catch(() => '');
  return text ? safeJson(text) : undefined;
}
