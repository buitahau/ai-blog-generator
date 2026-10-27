import { useCallback, useEffect, useRef } from 'react';
import { theme } from 'antd';

const NEAR_BOTTOM_PX = 40;

// Token-based style shared by the agent text boxes.
export function useAgentBoxStyle() {
  const { token } = theme.useToken();
  return {
    maxHeight: 240,
    overflowY: 'auto',
    padding: token.paddingSM,
    background: token.colorFillQuaternary,
    borderRadius: token.borderRadius,
  };
}

// Keeps a streaming box scrolled to the newest text unless the user scrolled up.
// Returns a callback ref that also wires the scroll listener, so no ref is read during render.
export function usePinToBottom(text) {
  const el = useRef(null);
  const pinned = useRef(true);
  const handlerRef = useRef(null);
  const ref = useCallback((node) => {
    if (el.current && handlerRef.current) {
      el.current.removeEventListener('scroll', handlerRef.current);
    }
    el.current = node;
    handlerRef.current = null;
    if (!node) return;
    const handler = () => {
      pinned.current = node.scrollHeight - node.scrollTop - node.clientHeight < NEAR_BOTTOM_PX;
    };
    handlerRef.current = handler;
    node.addEventListener('scroll', handler);
  }, []);
  useEffect(() => {
    const node = el.current;
    if (node && pinned.current) node.scrollTop = node.scrollHeight;
  }, [text]);
  return ref;
}
