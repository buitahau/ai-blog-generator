import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { generateSchema } from '../src/validation/generateSchema.js';
import { validate } from '../src/middleware/validate.js';

const valid = { topic: 'Intro to testing' };

describe('generateSchema', () => {
  it('applies defaults and trims strings', () => {
    const r = generateSchema.safeParse({ topic: '  Intro to testing  ', keywords: [' a '] });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({
      topic: 'Intro to testing',
      tone: 'professional',
      length: 'medium',
      keywords: ['a'],
    });
  });

  it('accepts a full valid body', () => {
    const body = {
      topic: 'abc',
      tone: 'technical',
      length: 'long',
      audience: 'devs',
      keywords: Array.from({ length: 10 }, () => 'k'.repeat(40)),
    };
    expect(generateSchema.safeParse(body).success).toBe(true);
  });

  it('treats a blank audience as not provided', () => {
    const r = generateSchema.safeParse({ ...valid, audience: '   ' });
    expect(r.success).toBe(true);
    expect(r.data.audience).toBeUndefined();
  });
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.post('/t', validate(generateSchema), (req, res) => res.json(req.body));
  return app;
}

describe('validate middleware', () => {
  it.each([
    ['missing topic', {}, 'topic'],
    ['short topic', { topic: 'hi' }, 'topic'],
    ['whitespace-only topic', { topic: '   ' }, 'topic'],
    ['topic > 200', { topic: 'x'.repeat(201) }, 'topic'],
    ['bad tone', { ...valid, tone: 'angry' }, 'tone'],
    ['bad length', { ...valid, length: 'huge' }, 'length'],
    ['audience > 100', { ...valid, audience: 'x'.repeat(101) }, 'audience'],
    ['> 10 keywords', { ...valid, keywords: Array(11).fill('k') }, 'keywords'],
    ['keyword > 40', { ...valid, keywords: ['ok', 'x'.repeat(41)] }, 'keywords.1'],
    ['empty keyword', { ...valid, keywords: [''] }, 'keywords.0'],
  ])('rejects %s', async (_name, body, path) => {
    const res = await request(makeApp()).post('/t').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d) => d.path)).toContain(path);
  });

  it.each(['max_tokens', 'model'])('rejects unknown key %s', async (key) => {
    const res = await request(makeApp()).post('/t').send({ ...valid, [key]: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.path)).toContain(key);
  });

  it('names a non-object body "body"', async () => {
    const res = await request(makeApp()).post('/t').send([1]);
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('body');
  });

  it('returns 400 with details[0].path == "topic" for {"topic":"hi"}', async () => {
    const res = await request(makeApp()).post('/t').send({ topic: 'hi' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('topic');
    expect(typeof res.body.error.details[0].message).toBe('string');
  });

  it('passes a valid body through with defaults', async () => {
    const res = await request(makeApp()).post('/t').send(valid);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...valid, tone: 'professional', length: 'medium' });
  });
});
