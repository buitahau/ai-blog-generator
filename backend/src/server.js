// config.js must load first: it runs dotenv before any module reads process.env.
import { PORT as port, assertConfig } from './config.js';
import app from './app.js';

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
