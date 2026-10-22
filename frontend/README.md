# Blog Generator frontend

React + Ant Design web app that generates blog posts with Claude. You enter a topic (plus optional tone, length, audience, and keywords) and the post streams into the page as Markdown. The app never talks to Claude directly: it calls the backend, which holds the API key.

## Prerequisites

- Node.js 22 or newer
- The backend running on `http://localhost:3001` (see [../backend/README.md](../backend/README.md))

## Setup

```
# terminal 1: backend
cd backend
npm install
cp .env.example .env   # set ANTHROPIC_API_KEY
npm run dev

# terminal 2: frontend
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Dev proxy

`vite.config.js` proxies every request starting with `/api` to `http://localhost:3001`, so the browser sees a single origin and no CORS setup is needed. The proxy sets `Accept-Encoding: identity` so the backend does not compress the response, which lets SSE chunks arrive as they are produced. The app always uses the relative URL `/api/generate`.

The proxy only exists in `npm run dev`. `npm run build` outputs static files in `dist/`; serve them behind a server that forwards `/api` to the backend and does not buffer responses.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server on port 5173. |
| `npm run build` | Production build into `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm test` | Run the test suite (`fetch` is mocked, no backend needed). |
| `npm run lint` | Run ESLint. |

## Folder structure

```
src/
  main.jsx          entry: BrowserRouter + AppRoutes
  AppRoutes.jsx     routes: /, /blogs/:slug, /admin/login, /admin/generate, /admin/blogs, * (404)
  layouts/          PublicLayout, AdminLayout (Sider menu: Generate, Blogs, Logout)
  pages/            route pages
  App.jsx           old form page: layout, error Alerts, retry (not routed)
  api/              backend calls (generate.js) and the SSE parser (sse.js)
  hooks/            useBlogGeneration: streaming state, cancel
  components/       BlogForm, BlogOutput, MarkdownView (shared sanitized renderer)
  constants/        tone/length options and input limits (mirror the backend schema)
```

## Streaming and cancel

Submitting the form sends `POST /api/generate` and reads the response as Server-Sent Events: `delta` events append Markdown, `done` finishes (a `max_tokens` stop reason shows a "cut off" notice), `error` ends the stream with a code and message. Incoming text is batched per animation frame to keep rendering smooth. The rendered Markdown is sanitized (`rehype-sanitize`).

Pressing Cancel aborts the request. Text received so far stays on screen and a "Generation cancelled" notice appears; the backend stops the upstream request when the connection closes. Starting a new generation also cancels the previous one.

## Errors

| Code | Source | Shown as |
| --- | --- | --- |
| `VALIDATION_ERROR` | backend | toast plus field errors in the form |
| `RATE_LIMITED`, `OVERLOADED` | backend (in stream) | "service is busy" warning |
| `UPSTREAM_ERROR`, `INTERNAL_ERROR` | backend | error with Retry |
| `STREAM_INTERRUPTED` | client: stream ended early or dropped | error with Retry |
| `NETWORK_ERROR` | client: request could not reach the server | error with Retry |
| `HTTP_ERROR` | client: non-OK response with no `error.code` in the body | error with Retry |
| `INVALID_JSON`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, others | backend | error without Retry |

## Troubleshooting

- **`HTTP_ERROR` "Request failed with status 502" in dev, with `http proxy error … ECONNREFUSED` in the Vite log**: the backend is not running. The browser still reaches the Vite proxy, which returns an empty 502. Start the backend with `cd backend && npm run dev` and check it listens on port 3001. If you changed the backend `PORT`, update the proxy `target` in `vite.config.js`.
- **"Could not reach the server" / `NETWORK_ERROR`**: the browser could not reach the server at all. In dev, the Vite dev server itself is not running or the page is loaded from a stale origin.
- **Output stays blank, then the whole post appears at once (or never)**: something between the browser and backend is buffering the SSE response. In dev, make sure the Vite proxy config is unchanged (`Accept-Encoding: identity`). Behind nginx or another reverse proxy, disable response buffering and compression for `/api/generate`; the backend already sends `X-Accel-Buffering: no`.
- **`HTTP_ERROR` with a 404, or a 5xx when not using the dev proxy**: the request hit something other than the backend (for example a static server with no `/api` proxy). In dev, a 502 means the backend is down (see above).
