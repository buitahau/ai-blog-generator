# F7 - Write frontend CLAUDE.md and README.md

- **Side:** frontend
- **Area:** frontend
- **Size:** S
- **Status:** resolved
- **Depends on:** [F6 - Wire up main page and error display](f6-frontend-main-page-errors.md) (first draft can start after [F1](f1-frontend-scaffold.md))
- **Requirement:** [Blog Generator scaffold](00-requirement.md)

## Description

### `frontend/CLAUDE.md` (for agents)

- Layout: `api/`, `hooks/`, `components/`, `constants/`, `pages/`.
- Commands: `dev`, `build`, `test`, `lint`.
- Rules:
  - No `@anthropic-ai/sdk` and no API keys.
  - API calls only in `src/api/`, never in components.
  - antd components and theme tokens over custom CSS.
  - Markdown rendering stays sanitized: `rehype-sanitize`, no `rehype-raw`.
  - The Vite proxy forwards `/api` to the backend.
  - Errors are shown via antd `message` / `Alert`.

### `frontend/README.md` (for humans)

- What the app does.
- Prerequisites.
- Setup and running. The backend must run on port 3001.
- How the dev proxy works.
- Build and test commands.
- Folder structure.
- Streaming and cancel behaviour.
- Troubleshooting:
  - blank output when a proxy buffers SSE
  - backend not running

### Root `CLAUDE.md`

- Updated to link to both subfolder `CLAUDE.md` files.

## Acceptance criteria

- [x] Both files exist in `frontend/`.
- [x] Commands and paths match `package.json` and `vite.config.js`.
- [x] The README names the backend dependency and the proxy target.
- [x] Root `CLAUDE.md` links to both subfolder `CLAUDE.md` files.

## Verification

- Follow the README from a clean clone with the backend running: the app loads and a post streams.
- `grep -ri anthropic frontend/src frontend/package.json` still returns nothing.

## API contract

None. Documentation task.
