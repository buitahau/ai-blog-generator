import { Router } from 'express';
import { LENGTH_PRESETS, HEARTBEAT_MS } from '../config.js';
import { validate } from '../middleware/validate.js';
import { generateSchema } from '../validation/generateSchema.js';
import { buildBlogPrompt } from '../prompts/blogPost.js';
import { streamBlogPost, ClaudeServiceError, StreamAbortedError } from '../services/claude.js';
import { initSse, sendEvent, sendComment } from '../lib/sse.js';

const router = Router();

router.post('/', validate(generateSchema), async (req, res) => {
  const { system, messages } = buildBlogPrompt(req.body);
  // max_tokens comes from the server-side preset only; the client cannot set it.
  const maxTokens = LENGTH_PRESETS[req.body.length].maxTokens;

  const controller = new AbortController();
  let heartbeat;
  const stopHeartbeat = () => clearInterval(heartbeat);

  res.on('close', () => {
    stopHeartbeat();
    if (!res.writableFinished) controller.abort();
  });

  initSse(res);
  sendEvent(res, 'start', {});
  heartbeat = setInterval(() => sendComment(res, 'ping'), HEARTBEAT_MS);

  try {
    const { stopReason, usage } = await streamBlogPost({
      system,
      messages,
      maxTokens,
      signal: controller.signal,
      onText: (text) => sendEvent(res, 'delta', { text }),
    });
    // The contract only allows end_turn|max_tokens; refusal becomes an error
    // and any other SDK value (stop_sequence, pause_turn) is a normal finish.
    if (stopReason === 'refusal') {
      sendEvent(res, 'error', {
        code: 'UPSTREAM_ERROR',
        message: 'The model declined to write this post. Try a different topic.',
      });
    } else {
      sendEvent(res, 'done', {
        stopReason: stopReason === 'max_tokens' ? 'max_tokens' : 'end_turn',
        usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens },
      });
    }
  } catch (err) {
    if (err instanceof StreamAbortedError) {
      console.info('Generation aborted by client.');
    } else {
      const known = err instanceof ClaudeServiceError;
      if (!known) console.error('Unexpected generate error:', err);
      sendEvent(res, 'error', {
        code: known ? err.code : 'INTERNAL_ERROR',
        message: known ? err.message : 'Unexpected server error.',
      });
    }
  } finally {
    stopHeartbeat();
    if (!res.writableEnded) res.end();
  }
});

export default router;
