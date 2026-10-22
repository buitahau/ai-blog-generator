# B1 - Scaffold backend package with health endpoint

- **Side:** backend
- **Area:** backend
- **Size:** S
- **Depends on:** none
- **Requirement:** [Blog Generator scaffold](00-requirement.md)

## Description

Create `backend/` with:

- `package.json` with `"type": "module"` and `engines.node >=22`.
- Scripts: `dev` (`node --watch src/server.js`), `start`, `test`, `lint`.
- Dependencies: `express`, `dotenv`, `zod`, `@anthropic-ai/sdk`.
- Dev dependencies: `vitest`, `supertest`, `eslint`.
- `src/app.js` builds the Express app without listening.
- `src/server.js` starts the app.
- `GET /api/health`.
- JSON body parser with a 10 KB limit, and a central JSON error handler for `400 INVALID_JSON`, `413`, and `415`.
- `backend/.env.example` with `ANTHROPIC_API_KEY=your-key-here`, `PORT=3001`, `ANTHROPIC_MODEL=`.
- `.gitignore` covering `.env` and `node_modules`.
- Update backend commands in the ROOT `CLAUDE.md` if scripts differ. Per-part docs are owned by B7.

## Acceptance criteria

- [ ] `npm install && npm run dev` starts on `PORT`.
- [ ] `/api/health` returns 200.
- [ ] Malformed JSON returns `400 INVALID_JSON`, a body over 10 KB returns `413`, and a non-JSON content type returns `415`, all in the contract format.
- [ ] `.env` is gitignored and `.env.example` is committed.

## Verification

- `curl -s localhost:3001/api/health`
- `curl -s -XPOST -H 'Content-Type: application/json' -d '{bad' localhost:3001/api/generate` returns `400 INVALID_JSON`.
- `npm test` passes supertest tests for health, 400, 413, and 415.
- `git check-ignore backend/.env` matches.

## API contract

### `GET /api/health`

- `200` `{"status":"ok"}`

### Error responses (pre-stream JSON)

- `400` `{"error":{"code":"INVALID_JSON","message":"..."}}`
- `413` `{"error":{"code":"PAYLOAD_TOO_LARGE","message":"..."}}`
- `415` `{"error":{"code":"UNSUPPORTED_MEDIA_TYPE","message":"..."}}`
