// config.js must load first: it runs dotenv before any module reads process.env.
import { PORT as port, assertConfig } from './config.js';
import app from './app.js';
import { runRegistry } from './services/runRegistry.js';

try {
  assertConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const server = app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});

server.on('error', (err) => {
  console.error(
    err.code === 'EADDRINUSE'
      ? `Port ${port} is already in use. Set PORT to a free port.`
      : `Server failed to start: ${err.message}`,
  );
  process.exit(1);
});

// Aborts active runs and waits for their agents and temp dirs to clean up before closing.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) {
    console.error(`${signal} received again, forcing exit.`);
    process.exit(1);
  }
  shuttingDown = true;
  console.log(`${signal} received, shutting down.`);
  try {
    await runRegistry.shutdown();
  } catch (err) {
    console.error('Shutdown failed:', err);
  }
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  // Stragglers (e.g. an SSE client that never read the final event) must not block exit.
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
