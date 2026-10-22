export function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function readHttpError(response) {
  const body = safeJson(await response.text().catch(() => ''));
  const err = body?.error;
  return {
    code: err?.code ?? 'HTTP_ERROR',
    message: err?.message ?? `Request failed with status ${response.status}.`,
    details: err?.details,
  };
}
