import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { usePinToBottom } from './useAgentBox.js';

function Box({ text }) {
  const ref = usePinToBottom(text);
  return <div ref={ref} data-testid="box" />;
}

function setMetrics(node, { scrollHeight, clientHeight }) {
  Object.defineProperty(node, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(node, 'clientHeight', { value: clientHeight, configurable: true });
}

describe('usePinToBottom', () => {
  it('follows new text while pinned and stops after the user scrolls up', () => {
    const { getByTestId, rerender } = render(<Box text="a" />);
    const node = getByTestId('box');
    setMetrics(node, { scrollHeight: 1000, clientHeight: 200 });

    rerender(<Box text="ab" />);
    expect(node.scrollTop).toBe(1000);

    node.scrollTop = 100;
    node.dispatchEvent(new Event('scroll'));
    setMetrics(node, { scrollHeight: 1200, clientHeight: 200 });
    rerender(<Box text="abc" />);
    expect(node.scrollTop).toBe(100);

    node.scrollTop = 1000;
    node.dispatchEvent(new Event('scroll'));
    rerender(<Box text="abcd" />);
    expect(node.scrollTop).toBe(1200);
  });
});
