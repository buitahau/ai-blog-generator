// Mirrors backend/src/validation/generateSchema.js; keep in sync.
export const TONE_OPTIONS = [
  { value: 'professional', label: 'Professional' },
  { value: 'casual', label: 'Casual' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'persuasive', label: 'Persuasive' },
  { value: 'technical', label: 'Technical' },
];

export const LENGTH_OPTIONS = [
  { value: 'short', label: 'Short' },
  { value: 'medium', label: 'Medium' },
  { value: 'long', label: 'Long' },
];

export const DEFAULTS = { tone: 'professional', length: 'medium' };

export const LIMITS = {
  topicMin: 3,
  topicMax: 200,
  audienceMax: 100,
  keywordsMax: 10,
  keywordMax: 40,
};

// Mirrors the page max in backend/src/validation/blogsSchema.js; keep in sync.
export const PAGE_MAX = 1_000_000;
