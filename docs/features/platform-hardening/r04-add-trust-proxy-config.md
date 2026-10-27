# r04 - Add TRUST_PROXY config

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** none
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- An unconditional `trust proxy = 1` is unsafe. When the app is not behind a proxy, a client can spoof `X-Forwarded-For`. The hop count comes from an env variable instead (D3).
- In `backend/src/config.js`, export `TRUST_PROXY`: `false` when unset or blank, otherwise `Number(value)`. Parsing never throws at import.
- `assertConfig()` throws `TRUST_PROXY must be a non-negative integer` when the value is not an integer greater than or equal to 0.
- In `backend/src/app.js`, `createApp({ trustProxy = TRUST_PROXY })` calls `app.set('trust proxy', trustProxy)`.
- Add `TRUST_PROXY=` with a comment to `backend/.env.example`.

Files:

- `backend/src/config.js`
- `backend/src/app.js`
- `backend/.env.example`
- `backend/test/config.test.js`
- `backend/test/app.test.js`

## Acceptance criteria

- [ ] With `TRUST_PROXY` unset, `req.ip` ignores `X-Forwarded-For`.
- [ ] `createApp({ trustProxy: 1 })` gives `req.ip` from `X-Forwarded-For`.
- [ ] `TRUST_PROXY=abc` makes `assertConfig` throw.

## Verification

- `config.test.js` covers the parsing and `assertConfig` cases.
- `app.test.js` has a temporary route that returns `req.ip`, run with and without `trustProxy`.

## API contract

None. Config only.
