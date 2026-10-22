import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BlogForm from './BlogForm.jsx';

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

it('blocks submit and shows an error when topic is empty', async () => {
  const onSubmit = vi.fn();
  render(<BlogForm onSubmit={onSubmit} />);
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));
  expect(await screen.findByText('Topic is required')).toBeTruthy();
  expect(onSubmit).not.toHaveBeenCalled();
});

it('submits the expected payload with defaults and omits empty optionals', async () => {
  const onSubmit = vi.fn();
  render(<BlogForm onSubmit={onSubmit} />);
  fireEvent.change(screen.getByLabelText('Topic'), { target: { value: '  Intro to SSE  ' } });
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(onSubmit.mock.calls[0][0]).toEqual({
    topic: 'Intro to SSE',
    tone: 'professional',
    length: 'medium',
  });
});

it('shows Cancel only while loading and calls onCancel', () => {
  const onCancel = vi.fn();
  const { rerender } = render(<BlogForm onSubmit={() => {}} loading={false} onCancel={onCancel} />);
  expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull();
  rerender(<BlogForm onSubmit={() => {}} loading onCancel={onCancel} />);
  fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
  expect(onCancel).toHaveBeenCalled();
});

it('shows backend details inside the matching fields and skips unknown paths', async () => {
  render(
    <BlogForm
      onSubmit={() => {}}
      errorDetails={[
        { path: 'topic', message: 'Too short from server' },
        { path: 'keywords.1', message: 'Keyword too long' },
        { path: 'body', message: 'Body problem' },
        { path: 'mystery', message: 'Unknown problem' },
      ]}
    />,
  );
  const topicItem = screen.getByLabelText('Topic').closest('.ant-form-item');
  const keywordsItem = screen.getByText('Keywords', { selector: 'label' }).closest('.ant-form-item');
  expect(await within(topicItem).findByText('Too short from server')).toBeTruthy();
  expect(await within(keywordsItem).findByText('Keyword too long')).toBeTruthy();
  expect(screen.queryByText('Body problem')).toBeNull();
  expect(screen.queryByText('Unknown problem')).toBeNull();
});

it('rejects a topic that is too short once trimmed', async () => {
  const onSubmit = vi.fn();
  render(<BlogForm onSubmit={onSubmit} />);
  fireEvent.change(screen.getByLabelText('Topic'), { target: { value: '  ab  ' } });
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));
  expect(await screen.findByText(/at least/i)).toBeTruthy();
  expect(onSubmit).not.toHaveBeenCalled();
});
