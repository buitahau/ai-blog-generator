# F4 - Generation form component

- **Side:** frontend
- **Area:** frontend
- **Size:** S
- **Depends on:** [F1 - Scaffold Vite + React + antd app](f1-frontend-scaffold.md) (field rules from [B3](b3-backend-request-validation.md) and the contract)
- **Requirement:** [Blog Generator scaffold](00-requirement.md)

## Description

`frontend/src/components/BlogForm.jsx` using antd `Form`:

- `topic`: `Input`, required, 3–200, with a character counter.
- `tone`: `Select`.
- `length`: `Segmented` or `Radio.Group`.
- `audience`: `Input`, ≤100.
- `keywords`: `Select mode="tags"`, ≤10 items, each ≤40.
- Defaults match the backend.

Props:

- `onSubmit(values)`
- `loading`
- `onCancel`

While streaming, Generate shows loading and a Cancel button appears.

Tone and length options live in `src/constants/options.js`.

Backend `VALIDATION_ERROR` details are shown on the matching fields via `form.setFields`.

## Acceptance criteria

- [ ] Client rules match backend limits.
- [ ] The submit payload matches the contract (`keywords` omitted when empty).
- [ ] Backend details appear on the right fields.
- [ ] Fields are keyboard-navigable and labelled.

## Verification

- React Testing Library tests:
  - empty topic blocks submit and shows an error
  - a valid submit calls `onSubmit` with the expected object
  - Cancel shows while loading
- Manual: tab through the form; Enter submits.

## API contract

Submit payload follows [`POST /api/generate`](00-requirement.md#api-contract):

- `topic` (string, required, 3–200)
- `tone` (`professional` \| `casual` \| `friendly` \| `persuasive` \| `technical`; default `professional`)
- `length` (`short` \| `medium` \| `long`; default `medium`)
- `audience` (optional, ≤100)
- `keywords` (optional, ≤10 items, each 1–40; omitted when empty)
