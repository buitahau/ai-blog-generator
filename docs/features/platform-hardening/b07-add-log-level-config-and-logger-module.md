# B07 - Add LOG_LEVEL config and a logger module

- **Status:** TBD
- **Side:** backend
- **Size:** S
- **Depends on:** none
- **Requirement:** [Platform hardening](00-requirement.md)

## Description

- In `backend/src/config.js`:
  - `LOG_LEVELS = ['silent', 'error', 'warn', 'info', 'debug']`.
  - `LOG_LEVEL = LOG_LEVELS.includes(v) ? v : 'info'`, where `v = process.env.LOG_LEVEL?.trim().toLowerCase()`.
- New `backend/src/lib/logger.js`:
  - `createLogger({ level })` returns `{ error, warn, info, debug }`.
  - Each method calls `console[method](...args)` only when its rank is within `level`.
  - `console[method]` is looked up at call time and never cached.
  - Export `logger = createLogger({ level: LOG_LEVEL })`.
  - No prefix and no formatting.
- New `backend/vitest.config.js` with `test: { env: { LOG_LEVEL: 'debug' } }`. A local `.env` cannot silence the console spies, because dotenv does not overwrite variables that are already set.
- `backend/.env.example`: `LOG_LEVEL=info`.
- Files: `backend/src/config.js`, `backend/src/lib/logger.js`, `backend/vitest.config.js`, `backend/.env.example`, `backend/test/logger.test.js`.

## Acceptance criteria
- [ ] Level `warn`: `error` and `warn` reach the console; `info` and `debug` do not.
- [ ] Level `silent`: nothing is printed.
- [ ] Level `debug`: all four are printed.
- [ ] An invalid or blank `LOG_LEVEL` gives `info`.
- [ ] Arguments pass through identically, so `toHaveBeenCalledWith('a:', obj)` matches.

## Verification

- `logger.test.js` puts spies on all four console methods.
- With `LOG_LEVEL=silent` in `backend/.env`, `npm test` passes for the whole suite. A `.env` cannot silence the spies, because `vitest.config.js` sets `LOG_LEVEL=debug` for tests.

## API contract

None. Internal module.
