# F5 - Output panel with safe Markdown rendering

- **Side:** frontend
- **Area:** frontend
- **Size:** S
- **Depends on:** [F1 - Scaffold Vite + React + antd app](f1-frontend-scaffold.md)
- **Requirement:** [Blog Generator scaffold](00-requirement.md)

## Description

`frontend/src/components/BlogOutput.jsx`:

- Renders `content` with `react-markdown` + `rehype-sanitize`. Do not use `rehype-raw`.
- Markdown elements are styled with antd `Typography`.
- Inside an antd `Card`, shows:
  - `Spin` / typing indicator while streaming
  - `Empty` when idle
  - `Alert` warning when `stopReason === "max_tokens"`
  - `Alert` info when cancelled
  - Copy-to-clipboard button for the raw Markdown, with `message.success`
- The container has `aria-live="polite"` and `aria-busy`.

## Acceptance criteria

- [ ] Headings, lists, and code render.
- [ ] `<script>`, `<img onerror>`, and `javascript:` links do not run and are not rendered as live HTML.
- [ ] Truncation and cancel notices show in the matching states.
- [ ] Copy puts the raw Markdown on the clipboard.

## Verification

- RTL test with content `# Title\n<script>alert(1)</script>[x](javascript:alert(1))`:
  - renders an `h1`
  - no `script` element
  - no `javascript:` href
- Warning shows for `max_tokens`.
- Manual copy and paste.

## API contract

None. Renders the `content`, `stopReason`, and status produced by [F3](f3-frontend-generation-hook.md) from the [`done`](00-requirement.md#api-contract) event.
