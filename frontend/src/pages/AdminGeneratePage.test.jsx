import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminGeneratePage from './AdminGeneratePage.jsx';
import { useAgentRun } from '../hooks/useAgentRun.js';

vi.mock('../hooks/useAgentRun.js', () => ({ useAgentRun: vi.fn() }));

const agent = (over = {}) => ({ status: 'idle', text: '', tools: [], heartbeat: null, retrying: null, usage: null, numTurns: null, costUsd: null, ...over });
const pair = (researcher, writer) => ({
  instances: { 'researcher:1': researcher, 'writer:1': writer },
  order: ['researcher:1', 'writer:1'],
});
const base = (over = {}) => ({
  runId: 'r1',
  title: 'My title',
  status: 'running',
  steps: { plan: 'pending', research: 'pending', write: 'pending', save: 'pending', notify: 'pending' },
  decisions: [],
  ...pair(agent(), agent()),
  blog: null,
  notification: null,
  error: null,
  totalCostUsd: null,
  cancelling: false,
  history: [],
  start: vi.fn(),
  cancel: vi.fn(),
  reset: vi.fn(),
  reattach: vi.fn(),
  ...over,
});
const show = (state) => {
  useAgentRun.mockReturnValue(state);
  return render(
    <MemoryRouter>
      <AdminGeneratePage />
    </MemoryRouter>,
  );
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('shows tool calls, results and a heartbeat while researching, with Send disabled', () => {
  const s = base({
    steps: { research: 'active', write: 'pending', save: 'pending', notify: 'pending' },
    ...pair(
      agent({
        status: 'running',
        heartbeat: { toolName: 'WebFetch', elapsedSec: 45 },
        tools: [
          { toolUseId: 't1', name: 'WebSearch', input: { query: 'cats' }, status: 'ok', results: [{ title: 'Cat facts', url: 'https://e.com/c' }, { title: 'Evil', url: 'javascript:alert(1)' }] },
          { toolUseId: 't2', name: 'WebFetch', input: { url: 'https://e.com/c' }, status: 'running' },
        ],
      }),
      agent(),
    ),
  });
  show(s);
  expect(screen.getByText('cats')).toBeTruthy();
  expect(screen.getAllByText('https://e.com/c').length).toBeGreaterThan(0);
  expect(screen.getByText(/Waiting on WebFetch… 45 s/)).toBeTruthy();
  expect(screen.getByRole('button', { name: /send/i }).disabled).toBe(true);
  fireEvent.click(screen.getByText('cats'));
  expect(screen.getByText('Cat facts').closest('a').getAttribute('href')).toBe('https://e.com/c');
  expect(screen.getByText('Evil').closest('a')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
  expect(s.cancel).toHaveBeenCalled();
});

it('streams writer text as plain text without rendering HTML', () => {
  const s = base({ ...pair(agent({ status: 'completed' }), agent({ status: 'running', text: '# Hi <img src=x onerror=alert(1)>' })) });
  const { container } = show(s);
  expect(screen.getByText(/# Hi <img/)).toBeTruthy();
  expect(container.querySelector('img')).toBeNull();
});

it('shows the draft link and Telegram status when completed', () => {
  show(base({
    status: 'done',
    blog: { blogId: 7, slug: 's', title: 't' },
    notification: { status: 'failed', errorCode: 'TELEGRAM_TIMEOUT' },
    ...pair(agent({ status: 'completed' }), agent({ status: 'completed', text: '# Done', usage: { inputTokens: 1, outputTokens: 2 }, numTurns: 3, costUsd: 0.1 })),
    totalCostUsd: 0.2,
  }));
  expect(screen.getByText('Draft saved')).toBeTruthy();
  expect(screen.getByText(/Telegram failed: Telegram did not respond/)).toBeTruthy();
  expect(screen.getByText('Open draft').closest('a').getAttribute('href')).toBe('/admin/blogs?highlight=7');
  expect(screen.getByRole('heading', { name: 'Done' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull();
});

it('names the failing agent and offers Retry', () => {
  const s = base({ status: 'error', error: { code: 'RUN_TIMEOUT', message: 'Timed out', agent: 'writer' } });
  show(s);
  expect(screen.getByText('Writer: Timed out')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /retry/i }));
  expect(s.start).toHaveBeenCalledWith('My title');
});

it('shows an info Alert when cancelled', () => {
  show(base({ status: 'cancelled' }));
  expect(screen.getByText('Run cancelled')).toBeTruthy();
});

it('RUN_IN_PROGRESS shows a warning with a reattach action', () => {
  const s = base({ runId: null, status: 'error', error: { code: 'RUN_IN_PROGRESS', message: 'busy' } });
  show(s);
  expect(screen.getByText('A run is already in progress')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /show it/i }));
  expect(s.reattach).toHaveBeenCalled();
});

it.each(['NOT_FOUND', 'UNAUTHORIZED'])('%s shows no Alert', (code) => {
  show(base({ runId: null, status: 'error', error: { code, message: 'x' } }));
  expect(screen.queryByRole('alert')).toBeNull();
});

it('quiet idle state shows the prompt and enables Send after typing; Enter submits', () => {
  const s = base({ runId: null, title: null, status: 'idle' });
  show(s);
  const input = screen.getByLabelText('Blog title');
  fireEvent.change(input, { target: { value: ' A title ' } });
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13, charCode: 13 });
  expect(s.start).toHaveBeenCalledWith('A title');
});

it('labels retries by backend category', () => {
  show(base({ ...pair(agent({ status: 'running', retrying: { category: 'RATE_LIMITED' } }), agent()) }));
  expect(screen.getByText('Retrying (rate limit)')).toBeTruthy();
});

it('offers Retry only when the run itself failed, not on a soft error during a live run', () => {
  const err = { code: 'NETWORK_ERROR', message: 'cancel failed' };
  show(base({ status: 'running', error: err }));
  expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  cleanup();
  show(base({ status: 'error', error: err }));
  expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
});

it('shows two researcher panels and the decision timeline for a two-pass run', () => {
  show(base({
    status: 'done',
    steps: { plan: 'done', research: 'done', write: 'done', save: 'done', notify: 'skipped' },
    instances: {
      'orchestrator:1': agent({ status: 'completed' }),
      'researcher:1': agent({ status: 'completed', text: 'first notes' }),
      'researcher:2': agent({ status: 'completed', text: 'second notes' }),
      'writer:1': agent({ status: 'completed', text: '# Post' }),
    },
    order: ['orchestrator:1', 'researcher:1', 'researcher:2', 'writer:1'],
    decisions: [
      { action: 'spawn_researcher', accepted: true, spawn: 1, focus: 'basics' },
      { action: 'spawn_researcher', accepted: true, spawn: 2, focus: 'pricing' },
      { action: 'spawn_writer', accepted: true, spawn: 1 },
    ],
  }));
  expect(screen.getByText('Researcher')).toBeTruthy();
  expect(screen.getByText('Researcher (pass 2)')).toBeTruthy();
  expect(screen.getByText('Orchestrator decisions')).toBeTruthy();
  expect(screen.getByText('Research (pass 2)')).toBeTruthy();
  expect(screen.getByText('pricing')).toBeTruthy();
  expect(screen.getByText('Plan')).toBeTruthy();
});

it('NO_DRAFT shows an error Alert, Retry, and no Open draft', () => {
  const s = base({
    status: 'error',
    steps: { plan: 'failed', research: 'skipped', write: 'skipped', save: 'pending', notify: 'pending' },
    instances: { 'orchestrator:1': agent({ status: 'completed' }) },
    order: ['orchestrator:1'],
    error: { code: 'NO_DRAFT', message: 'The orchestrator finished without writing a draft.', agent: 'orchestrator' },
  });
  show(s);
  expect(screen.getByText('Orchestrator: The orchestrator finished without writing a draft.')).toBeTruthy();
  expect(screen.queryByText('Open draft')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /retry/i }));
  expect(s.start).toHaveBeenCalledWith('My title');
});
