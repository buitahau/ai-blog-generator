# B3 - Request validation

- **Side:** backend
- **Area:** backend
- **Size:** S
- **Depends on:** [B1 - Scaffold backend package with health endpoint](b1-backend-scaffold-health.md)
- **Requirement:** [Blog Generator scaffold](00-requirement.md)

## Description

- `backend/src/validation/generateSchema.js`: strict zod schema that rejects unknown keys, trims strings, applies defaults, and enforces the contract limits.
- `backend/src/middleware/validate.js`: maps zod errors to `400 VALIDATION_ERROR` with `details`.

Contract limits:

- `topic`: required, trimmed, 3–200.
- `tone`: one of `professional|casual|friendly|persuasive|technical`, default `professional`.
- `length`: one of `short|medium|long`, default `medium`.
- `audience`: optional, ≤100.
- `keywords`: optional, array of ≤10 items, each 1–40.
- Unknown fields (including `max_tokens`, `model`) are rejected.

## Acceptance criteria

- [ ] A valid body passes, with defaults applied.
- [ ] Each of the following gets `400` with a matching `details.path`:
  - missing topic
  - short topic
  - topic > 200
  - bad tone
  - bad length
  - more than 10 keywords
  - keyword > 40
  - unknown key such as `max_tokens`

## Verification

- Table-driven vitest on the schema.
- supertest: `{"topic":"hi"}` returns 400 with `details[0].path == "topic"`.

## API contract

`POST /api/generate` request body (validated by this task):

| Field | Type | Rules |
|-------|------|-------|
| `topic` | string | required, trimmed, 3–200 |
| `tone` | string | `professional` \| `casual` \| `friendly` \| `persuasive` \| `technical`; default `professional` |
| `length` | string | `short` \| `medium` \| `long`; default `medium` |
| `audience` | string | optional, ≤100 |
| `keywords` | string[] | optional, ≤10 items, each 1–40 |

Error response:

- `400` `{"error":{"code":"VALIDATION_ERROR","message":"...","details":[{"path":"topic","message":"..."}]}}`
