import { createTelegramNotifier } from './telegramMcp.js';

// Reads env per call so credentials set after import (and tests) are honoured.
export const telegramNotifier = {
  notify(blog, options) {
    const timeout = Number(process.env.TELEGRAM_NOTIFY_TIMEOUT_MS);
    return createTelegramNotifier({
      botToken: process.env.TELEGRAM_BOT_TOKEN?.trim(),
      chatId: process.env.TELEGRAM_CHAT_ID?.trim(),
      adminBaseUrl: process.env.ADMIN_BASE_URL?.trim(),
      ...(timeout > 0 && { timeoutMs: timeout }),
    }).notify(blog, options);
  },
};
