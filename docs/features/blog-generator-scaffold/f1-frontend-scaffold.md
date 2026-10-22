# F1 - Scaffold Vite + React + antd app

- **Side:** frontend
- **Area:** frontend
- **Size:** S
- **Depends on:** none to build. The proxy check needs [B1](b1-backend-scaffold-health.md) running.
- **Requirement:** [Blog Generator scaffold](00-requirement.md)

## Description

Create `frontend/` with:

- Vite (React, JavaScript).
- Dependencies: `antd`, `@ant-design/icons`, `react-markdown`, `rehype-sanitize`.
- Dev dependencies: `vitest`, `@testing-library/react`, `jsdom`, `eslint`.
- `vite.config.js` proxies `/api` to `http://localhost:3001`, with buffering off so SSE passes through unchanged.
- `src/main.jsx` wraps the app in antd `ConfigProvider` and `App` (for the `message` hook).
- `src/App.jsx`: placeholder antd `Layout` with a header.
- Delete Vite template CSS and boilerplate.
- `frontend/.gitignore`.
- Update frontend commands in the ROOT `CLAUDE.md`. Per-part docs are owned by [F7](f7-frontend-docs.md).

## Acceptance criteria

- [ ] `npm install && npm run dev` serves the app with an antd layout.
- [ ] `fetch('/api/health')` from the browser returns ok through the proxy while the backend runs.
- [ ] No `@anthropic-ai/sdk` in `package.json`.
- [ ] No env var containing "ANTHROPIC".

## Verification

- Open `http://localhost:5173` and see the header.
- In devtools: `await (await fetch('/api/health')).json()` returns `{status:"ok"}`.
- `grep -ri anthropic frontend/src frontend/package.json` returns nothing.
- `npm test` smoke render passes.

## API contract

None. Frontend consumes [`GET /api/health`](00-requirement.md#api-contract) through the proxy.
