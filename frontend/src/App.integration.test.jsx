import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App as AntApp, ConfigProvider } from 'antd';
import App from './App.jsx';

const enc = new TextEncoder();
const sse = (event, data) => enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

// A response whose body the test feeds chunk by chunk; cancel/abort errors the reader.
function streamResponse() {
  let controller;
  const body = new ReadableStream({
    start: (c) => (controller = c),
    cancel: () => {},
  });
  return {
    response: new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    push: (event, data) => controller.enqueue(sse(event, data)),
    close: () => controller.close(),
  };
}

const errorResponse = (status, error) =>
  new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json' } });

const renderApp = () =>
  render(
    <ConfigProvider>
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>,
  );

const submitTopic = (topic = 'Intro to SSE') => {
  fireEvent.change(screen.getByLabelText('Topic'), { target: { value: topic } });
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));
};

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('streams a post to completion', async () => {
  const s = streamResponse();
  fetchMock.mockResolvedValueOnce(s.response);
  renderApp();
  submitTopic();

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ topic: 'Intro to SSE' });

  s.push('delta', { text: '# Hello' });
  expect(await screen.findByRole('heading', { name: 'Hello' })).toBeTruthy();
  s.push('delta', { text: '\n\nWorld text' });
  expect(await screen.findByText('World text')).toBeTruthy();
  s.push('done', { stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 2 } });
  s.close();

  await waitFor(() => expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull());
  expect(screen.getByText('World text')).toBeTruthy();
});

it('cancel aborts the request and keeps partial output', async () => {
  const s = streamResponse();
  fetchMock.mockResolvedValueOnce(s.response);
  renderApp();
  submitTopic();
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const { signal } = fetchMock.mock.calls[0][1];

  s.push('delta', { text: 'Partial text' });
  await screen.findByText('Partial text');
  fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

  expect(await screen.findByText('Generation cancelled.')).toBeTruthy();
  expect(signal.aborted).toBe(true);
  expect(screen.getByText('Partial text')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
});

it.each([
  ['UPSTREAM_ERROR', 502],
  ['INTERNAL_ERROR', 500],
])('%s shows an error Alert and Retry resends the last request', async (code, status) => {
  fetchMock.mockResolvedValueOnce(errorResponse(status, { code, message: `boom ${code}` }));
  renderApp();
  submitTopic('Retry me please');
  expect(await screen.findByText(`boom ${code}`)).toBeTruthy();

  const s = streamResponse();
  fetchMock.mockResolvedValueOnce(s.response);
  fireEvent.click(screen.getByRole('button', { name: /retry/i }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);

  s.push('delta', { text: 'Recovered text' });
  s.push('done', {});
  s.close();
  expect(await screen.findByText('Recovered text')).toBeTruthy();
  expect(screen.queryByText(`boom ${code}`)).toBeNull();
});

it('network failure shows Retry', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  renderApp();
  submitTopic();
  expect(await screen.findByText('Could not reach the server.')).toBeTruthy();
  expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
});

it('HTTP_ERROR (non-JSON 5xx, e.g. proxy with backend down) shows Alert and Retry', async () => {
  fetchMock.mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }));
  renderApp();
  submitTopic();
  expect(await screen.findByText('Request failed with status 502.')).toBeTruthy();
  expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
});

it('mid-stream interruption shows Retry', async () => {
  const s = streamResponse();
  fetchMock.mockResolvedValueOnce(s.response);
  renderApp();
  submitTopic();
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  s.push('delta', { text: 'Some text' });
  s.close(); // ends without a done event
  expect(await screen.findByText(/stream ended before the post was complete/i)).toBeTruthy();
  expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
});

it('in-stream error event shows the matching feedback', async () => {
  const s = streamResponse();
  fetchMock.mockResolvedValueOnce(s.response);
  renderApp();
  submitTopic();
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  s.push('error', { code: 'OVERLOADED', message: 'Overloaded upstream' });
  expect(await screen.findByText(/try again shortly/i)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
});

it('RATE_LIMITED shows a try-again-shortly Alert without Retry', async () => {
  fetchMock.mockResolvedValueOnce(errorResponse(429, { code: 'RATE_LIMITED', message: 'Slow down' }));
  renderApp();
  submitTopic();
  expect(await screen.findByText(/try again shortly/i)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
});

it('VALIDATION_ERROR maps details onto form fields and shows message.error', async () => {
  fetchMock.mockResolvedValueOnce(
    errorResponse(400, {
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      details: [{ path: 'topic', message: 'Server says topic is bad' }],
    }),
  );
  renderApp();
  submitTopic();
  expect(await screen.findByText('Server says topic is bad')).toBeTruthy();
  expect(await screen.findByText('Invalid request')).toBeTruthy();
  expect(screen.getByLabelText(/topic/i).getAttribute('aria-invalid')).toBe('true');
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
});

it.each([
  [400, 'INVALID_JSON'],
  [413, 'PAYLOAD_TOO_LARGE'],
  [415, 'UNSUPPORTED_MEDIA_TYPE'],
])('%s %s shows a non-retryable error Alert', async (status, code) => {
  fetchMock.mockResolvedValueOnce(errorResponse(status, { code, message: `msg ${code}` }));
  renderApp();
  submitTopic();
  expect(await screen.findByText(`msg ${code}`)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
});
