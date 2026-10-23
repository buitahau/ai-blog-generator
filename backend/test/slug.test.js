import { describe, expect, it } from 'vitest';
import { slugify } from '../src/lib/slug.js';

describe('slugify', () => {
  it('handles Vietnamese diacritics and đ', () => {
    expect(slugify('Tối ưu Đà Nẵng!')).toBe('toi-uu-da-nang');
  });
  it('kebab-cases and trims separators', () => {
    expect(slugify('  Hello,   World -- 2026 ')).toBe('hello-world-2026');
  });
  it('caps at 80 chars without a trailing dash', () => {
    const slug = slugify('word '.repeat(40));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });
  it('falls back to post', () => {
    expect(slugify('!!!')).toBe('post');
    expect(slugify('')).toBe('post');
    expect(slugify(undefined)).toBe('post');
  });
});
