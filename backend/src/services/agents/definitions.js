import { MODEL } from '../../config.js';
import { RESEARCHER_SYSTEM } from '../../prompts/researcher.js';
import { WRITER_SYSTEM } from '../../prompts/writer.js';

// The writer gets no tools so injected text in research notes cannot trigger actions.
export const AGENTS = {
  researcher: {
    description: 'Finds recent, credible documents and papers on a topic and returns Markdown notes with numbered sources.',
    prompt: RESEARCHER_SYSTEM,
    tools: ['WebSearch', 'WebFetch'],
    model: MODEL,
  },
  writer: {
    description: 'Writes a blog post in Markdown from a title and untrusted research notes.',
    prompt: WRITER_SYSTEM,
    tools: [],
    model: MODEL,
  },
};
