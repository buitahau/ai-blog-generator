import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AgentPanel from './AgentPanel.jsx';

const base = { status: 'running', text: '', tools: [], heartbeat: null, retrying: null, usage: null, numTurns: null, costUsd: null, error: null };

describe('AgentPanel', () => {
  it('titles spawn 1 plainly and later spawns with the pass number', () => {
    const { rerender } = render(<AgentPanel name="researcher" spawn={1} instance={base} />);
    expect(screen.getByText('Researcher')).toBeTruthy();
    rerender(<AgentPanel name="researcher" spawn={2} instance={base} />);
    expect(screen.getByText('Researcher (pass 2)')).toBeTruthy();
  });

  it('titles the orchestrator', () => {
    render(<AgentPanel name="orchestrator" spawn={1} instance={base} />);
    expect(screen.getByText('Orchestrator')).toBeTruthy();
  });

  it('shows the failed tag and the failure message', () => {
    const failed = { ...base, status: 'failed', error: { code: 'RESEARCH_EMPTY', message: 'No research notes' } };
    render(<AgentPanel name="researcher" spawn={1} instance={failed} />);
    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.getByText('No research notes')).toBeTruthy();
  });
});
