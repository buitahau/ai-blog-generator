import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

describe('app', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('returns 400 INVALID_JSON for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/generate')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
    expect(typeof res.body.error.message).toBe('string');
  });

  it('returns 413 PAYLOAD_TOO_LARGE for bodies over 10 KB', async () => {
    const res = await request(app)
      .post('/api/generate')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ topic: 'x'.repeat(11 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('returns 415 UNSUPPORTED_MEDIA_TYPE for non-JSON content type', async () => {
    const res = await request(app)
      .post('/api/generate')
      .set('Content-Type', 'text/plain')
      .send('hello');
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('returns 404 NOT_FOUND JSON for unknown routes', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('maps other 4xx body-parser errors to BAD_REQUEST, not 500', async () => {
    const res = await request(app)
      .post('/api/generate')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'br')
      .send('not brotli');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});
