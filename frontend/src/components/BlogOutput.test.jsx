import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import BlogOutput from './BlogOutput.jsx';

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  });
});
afterEach(cleanup);

const MALICIOUS = '# Title\n<script>alert(1)</script>[x](javascript:alert(1))\n\n<img src=x onerror="alert(1)">';

it('renders markdown safely', () => {
  const { container } = render(<BlogOutput content={MALICIOUS} status="done" />);
  expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeTruthy();
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('img')).toBeNull();
  expect(container.innerHTML).not.toMatch(/onerror/i);
  for (const a of container.querySelectorAll('a')) {
    expect(a.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
  }
});

it('neutralizes a javascript: link on its own line', () => {
  const { container } = render(<BlogOutput content={'[x](javascript:alert(1))'} status="done" />);
  const a = screen.getByText('x').closest('a');
  expect(a).not.toBeNull();
  expect(a.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
  expect(container.innerHTML).not.toMatch(/javascript:/i);
});

it('renders lists and code', () => {
  const { container } = render(<BlogOutput content={'- a\n- b\n\n```js\nconst x = 1;\n```'} status="done" />);
  expect(container.querySelectorAll('li')).toHaveLength(2);
  expect(container.querySelector('pre code')).toBeTruthy();
});

it('shows empty state when idle', () => {
  render(<BlogOutput status="idle" />);
  expect(screen.getByText(/will appear here/i)).toBeTruthy();
});

it('shows warning for max_tokens and info for cancelled', () => {
  const { rerender } = render(<BlogOutput content="hi" status="done" stopReason="max_tokens" />);
  expect(screen.getByText(/cut off/i)).toBeTruthy();
  rerender(<BlogOutput content="hi" status="cancelled" />);
  expect(screen.getByText(/cancelled/i)).toBeTruthy();
  expect(screen.queryByText(/cut off/i)).toBeNull();
});

it('marks the live region busy while streaming', () => {
  const { container } = render(<BlogOutput content="hi" status="streaming" />);
  const live = container.querySelector('[aria-live="polite"]');
  expect(live.getAttribute('aria-busy')).toBe('true');
});

it('copies raw markdown', async () => {
  const writeText = vi.fn().mockResolvedValue();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  render(<BlogOutput content={'# Raw **md**'} status="done" />);
  fireEvent.click(screen.getByRole('button', { name: /copy/i }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('# Raw **md**'));
});
