import { MODEL } from '../../config.js';
import { ORCHESTRATOR_SYSTEM } from '../../prompts/orchestrator.js';
import { RESEARCHER_SYSTEM } from '../../prompts/researcher.js';
import { WRITER_SYSTEM } from '../../prompts/writer.js';

// The writer gets no tools so injected text in research notes cannot trigger actions.
export const AGENTS = {
  // No built-ins. With `agent` set, the CLI exposes only the MCP names listed here (B01 Q3: `tools: []`
  // hides them); runAgentQuery keeps them out of the `tools` option and the run grants them via extraAllowedTools.
  orchestrator: {
    description: 'Decides which pipeline step runs next: research, write, or stop.',
    prompt: ORCHESTRATOR_SYSTEM,
    tools: ['mcp__pipeline__spawn_researcher', 'mcp__pipeline__spawn_writer'],
    model: MODEL,
  },
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
