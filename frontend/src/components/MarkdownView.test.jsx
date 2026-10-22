import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import MarkdownView from './MarkdownView.jsx';

afterEach(cleanup);

it('renders markdown and strips scripts, handlers and javascript: links', () => {
  const md = '# Title\n<script>alert(1)</script>[x](javascript:alert(1))\n\n<img src=x onerror="alert(1)">';
  const { container } = render(<MarkdownView content={md} />);
  expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeTruthy();
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('img')).toBeNull();
  expect(container.innerHTML).not.toMatch(/onerror/i);
  for (const a of container.querySelectorAll('a')) {
    expect(a.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
  }
});

// react-markdown's default URL filter would drop this link before the sanitizer runs, so the
// filter is disabled here to prove rehype-sanitize itself removes javascript: hrefs.
it('rehype-sanitize strips javascript: hrefs even when the URL filter is off', () => {
  const { container } = render(<MarkdownView content="[x](javascript:alert(1))" urlTransform={(u) => u} />);
  expect(container.querySelector('a')?.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
  expect(container.innerHTML).not.toMatch(/javascript:/i);
});
