# Blog Generator

Web app that generates blog posts with Claude. The React + Ant Design front-end streams posts from an Express API that wraps the Anthropic SDK and an orchestrator-driven research and writing pipeline (Claude Agent SDK).

```
frontend/   React + Vite + antd (UI only, no API keys)
backend/    Express 5 API, Claude calls, Neon Postgres (Drizzle)
docs/       feature requirements and task docs
```

## Prerequisites

- Node.js 22 or newer
- An Anthropic API key
- A Neon (Postgres) database and its connection string

## Quick start

Run the backend and the front-end in two terminals.

### 1. Backend

```
cd backend
npm install
cp .env.example .env
```

Edit `backend/.env` and set at least:

| Variable | Notes |
| --- | --- |
| `ANTHROPIC_API_KEY` | Your Anthropic key. Stays in `backend/.env` only. |
| `DATABASE_URL` | Neon connection string. |
| `ADMIN_TOKEN` | At least 32 characters, for example `openssl rand -hex 32`. |

Leave `ANTHROPIC_BASE_URL` unset unless you use a gateway. Then create the tables and start the server:

```
npm run db:migrate
npm run dev
```

The API listens on `http://localhost:3001`. Check it with `curl http://localhost:3001/api/health`.

### 2. Front-end

```
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The dev server proxies `/api` to the backend, so start the backend first.

## Common commands

| Where | Command | Description |
| --- | --- | --- |
| `backend` | `npm test` | Run tests (SDK mocked, no key needed). |
| `backend` | `npm run lint` | Run ESLint. |
| `frontend` | `npm test` | Run tests. |
| `frontend` | `npm run build` | Production build. |

## Troubleshooting

- The backend exits at startup: `ANTHROPIC_API_KEY` or `DATABASE_URL` is missing, or `ADMIN_TOKEN` is shorter than 32 characters.
- The UI shows network errors: the backend is not running on port 3001 (or `PORT` was changed; update the proxy in `frontend/vite.config.js`).
- Agent runs fail with `UPSTREAM_ERROR`: check the server log for `Unexpected agent tools:` and `[agent stderr]`.

## More documentation

- [backend/README.md](backend/README.md): env vars, scripts, API contract
- [frontend/README.md](frontend/README.md): setup, dev proxy, troubleshooting
- [docs/features/](docs/features/): requirements and task docs
- [CLAUDE.md](CLAUDE.md): project conventions
