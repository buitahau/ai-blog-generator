import { createHash, timingSafeEqual } from 'node:crypto';

const sha256 = (value) => createHash('sha256').update(value).digest();

// Hashing both sides gives equal-length buffers, which timingSafeEqual requires.
// The token is read per request so the module imports without the env var.
export function requireAdmin(getToken = () => process.env.ADMIN_TOKEN) {
  return (req, res, next) => {
    const expected = getToken();
    const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    if (expected && match && timingSafeEqual(sha256(match[1]), sha256(expected))) {
      return next();
    }
    res.set('WWW-Authenticate', 'Bearer');
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid admin token.' } });
  };
}
