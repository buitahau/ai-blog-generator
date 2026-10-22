import 'dotenv/config';
import app from './app.js';

const port = Number(process.env.PORT) || 3001;

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
