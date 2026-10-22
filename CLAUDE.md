# Blog Generator

Web app that generates blog posts with Claude. React + Ant Design front-end; backend calls Claude through the Anthropic SDK.

> The repo was empty when this file was written. Layout and commands below are the intended conventions — update them once the scaffolding exists.

## Stack

- **Front-end:** React, Ant Design (`antd`)
- **Backend:** Node.js + Anthropic SDK (`@anthropic-ai/sdk`)
- **Model:** use the latest Claude model; keep the model ID in one config constant, not scattered through the code.

## Intended layout

```
frontend/   React app (UI only, no API keys)
backend/    API server that wraps the Claude SDK
```

## Commands (update to match package.json)

```
# backend
cd backend && npm install && npm run dev

# frontend
cd frontend && npm install && npm run dev
```

## Conventions

- **API key security:** `ANTHROPIC_API_KEY` lives only in `backend/.env` (gitignored). Never import the SDK or reference the key in front-end code. Commit a `.env.example` with placeholder values.
- **Front-end → backend only:** the browser calls our backend endpoints; only the backend talks to Claude.
- **Streaming:** stream generated posts to the UI (SSE or chunked response) rather than waiting for the full completion. Handle abort/cancel and show errors via antd `message`/`Alert`.
- **Prompts:** keep prompt templates in a dedicated backend module (e.g. `backend/src/prompts/`), not inline in route handlers.
- **Validation:** validate request bodies (topic, tone, length, etc.) on the backend; cap input sizes and `max_tokens`.
- **UI:** use Ant Design components (Form, Input, Select, Button, Typography, Spin) and its theme tokens instead of custom CSS where possible. Render generated Markdown safely (sanitize output).
- **Components:** function components + hooks; keep API calls in a small `api/` module, not inside components.
- Match the style of surrounding code; keep comments sparse and explain *why*, not *what*.

## Notes for Claude

- Before writing Claude API code, check the `claude-api` skill for current model IDs and SDK usage.
- Don't commit or expose secrets; don't read `.env` unless necessary.
