import { readHttpError } from './http.js';

const KEY = 'adminToken';
const listeners = new Set();

// sessionStorage can throw (blocked storage); fall back to memory so the app still works.
let memoryToken = null;

export function getToken() {
  try {
    return sessionStorage.getItem(KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}

function write(token) {
  try {
    if (token) sessionStorage.setItem(KEY, token);
    else sessionStorage.removeItem(KEY);
    memoryToken = null;
  } catch {
    memoryToken = token;
  }
  listeners.forEach((fn) => fn());
}

export const setToken = (token) => write(token);
export const clearToken = () => write(null);

/** For useSyncExternalStore: lets the route guard react when the token is cleared (e.g. after a 401). */
export function subscribeToken(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * GET /api/admin/session. Resolves on 204; rejects { code, message } otherwise.
 * Pass a candidate token to test it without storing it.
 */
export async function checkToken(token = getToken()) {
  let response;
  try {
    response = await fetch('/api/admin/session', { headers: { Authorization: `Bearer ${token ?? ''}` } });
  } catch {
    throw { code: 'NETWORK_ERROR', message: 'Could not reach the server.' };
  }
  if (response.ok) return;
  if (response.status === 401) {
    throw { code: 'UNAUTHORIZED', message: (await readHttpError(response)).message };
  }
  throw await readHttpError(response);
}
