# Frontend

React 18 + Ant Design 5 (Vite, ESM) UI that streams blog posts from the backend over SSE. Human-facing docs: [README.md](README.md). Backend contract: [../backend/README.md](../backend/README.md).

## Layout

```
src/
  main.jsx                       entry: BrowserRouter + <AppRoutes />
  AppRoutes.jsx                  route table: / , /blogs/:slug, /admin/login, /admin/generate, /admin/blogs, * (404)
  layouts/                       PublicLayout (header + Outlet), AdminLayout (Sider Menu: Generate, Blogs, Logout)
  pages/                         route pages (BlogListPage at /, BlogDetailPage at /blogs/:slug; AdminBlogsPage at /admin/blogs; others are placeholders until later tasks)
  App.jsx                        old form page (form + output + error Alerts, retry); not routed, tests still run
  api/stream.js                  streamSse(): generic SSE client (error normalising, quiet abort, final events, SSE id, optional admin auth + 401 clear)
  api/generate.js                streamGenerate(): thin wrapper over streamSse for POST /api/generate
  api/runs.js                    startRun/getActiveRun/cancelRun (adminRequest), subscribeRun (streamSse with Last-Event-ID)
  api/blogs.js                   listBlogs(), getBlog(): GET /api/blogs, normalised { code, message, details? } rejections
  api/http.js                    safeJson(), readHttpError(): shared by generate.js and blogs.js
  api/auth.js                    sessionStorage token (get/set/clear/subscribeToken), checkToken(): GET /api/admin/session
  api/adminBlogs.js              listAdminBlogs/getAdminBlog/publishBlog/unpublishBlog/deleteBlog via adminRequest
  api/admin.js                   adminRequest(): Bearer header; on 401 clears token, rejects {code:'UNAUTHORIZED'} (no navigation)
  api/sse.js                     createSseParser(): pure SSE frame parser
  hooks/useBlogGeneration.js     state machine (idle/streaming/done/error/cancelled), batched deltas, cancel
  components/RequireAdmin.jsx    route guard: no token -> /admin/login?next=<path>; reacts to token clears
  components/BlogForm.jsx        antd Form (topic, tone, length, audience, keywords)
  components/BlogOutput.jsx      copy + status Alerts around MarkdownView
  components/MarkdownView.jsx    shared sanitized Markdown rendering (react-markdown + rehype-sanitize)
  constants/options.js           TONE_OPTIONS, LENGTH_OPTIONS, DEFAULTS, LIMITS, PAGE_MAX (mirror the backend schemas)
  test-setup.js                  vitest setup
```

Tests sit next to the code as `*.test.js(x)`. Routing uses `react-router-dom` v6; deep links work through Vite's SPA fallback.

## Commands

Run from `frontend/`:

```
npm run dev      # vite dev server on http://localhost:5173
npm run build    # vite build -> dist/
npm run preview  # serve the built bundle
npm test         # vitest run (jsdom)
npm run lint     # eslint .
```

## Rules

- No `@anthropic-ai/sdk` and no API keys in the front-end. The browser only talks to our backend. `grep -ri anthropic src package.json` must return nothing.
- API calls live only in `src/api/`. Components and hooks call `streamGenerate`, `listBlogs`, `getBlog` and the `api/adminBlogs.js` functions (which go through `adminRequest`); they never use `fetch` directly. `listBlogs`/`getBlog` reject with `{ code, message, details? }` or an `AbortError` on cancel. Shared HTTP helpers live in `api/http.js`.
- The Vite dev proxy (`vite.config.js`) forwards `/api` to `http://localhost:3001` and sends `Accept-Encoding: identity` so SSE chunks are not buffered. Use relative URLs (`/api/generate`) only.
- Prefer antd components and theme tokens (`theme.useToken()`) over custom CSS.
- Markdown rendering stays sanitized: `react-markdown` with `rehype-sanitize`; never add `rehype-raw` or `dangerouslySetInnerHTML`.
- Errors are shown through antd `message` / `Alert`. `streamGenerate` reports errors as `{ code, message, details? }` via `onError`. Codes handled in `App.jsx`:
  - `VALIDATION_ERROR`: `message.error` plus per-field errors in the form (from `details`).
  - `RATE_LIMITED`, `OVERLOADED`: warning Alert, no retry button.
  - `UPSTREAM_ERROR`, `INTERNAL_ERROR`: error Alert with Retry.
  - `STREAM_INTERRUPTED`, `NETWORK_ERROR`, `HTTP_ERROR`: error Alert with Retry. These three are produced by the client itself in `api/stream.js` (stream cut off, fetch failed, non-OK response with no `error.code` in the body, including the Vite proxy's 502 when the backend is down; in dev that shows up as `HTTP_ERROR`, not `NETWORK_ERROR`).
  - `INVALID_JSON`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE` and any other code: plain error Alert, no retry.
- Abort is a cancel: `streamGenerate` resolves quietly without `onError`. Keep that path intact; the hook ignores callbacks from superseded requests.
- `constants/options.js` mirrors `backend/src/validation/generateSchema.js`; change both together.
- Tests mock `fetch`; they never need the backend or a key.
- Function components + hooks. Keep comments sparse and about why.
