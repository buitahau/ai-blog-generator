import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import OrchestratorPanel from './OrchestratorPanel.jsx';

describe('OrchestratorPanel', () => {
  it('renders accepted and rejected decisions', () => {
    render(
      <OrchestratorPanel
        decisions={[
          { action: 'spawn_researcher', accepted: true, spawn: 2, focus: 'pricing' },
          { action: 'spawn_writer', accepted: true, spawn: 1 },
          { action: 'spawn_researcher', accepted: false, reason: 'LIMIT_REACHED' },
          { action: 'spawn_writer', accepted: false, reason: 'SPAWN_IN_PROGRESS' },
          { action: 'spawn_writer', accepted: false, reason: 'WEIRD' },
        ]}
      />,
    );
    expect(screen.getByText('Research (pass 2)')).toBeTruthy();
    expect(screen.getByText('pricing')).toBeTruthy();
    expect(screen.getByText('Write')).toBeTruthy();
    expect(screen.getByText(/limit reached/)).toBeTruthy();
    expect(screen.getByText(/another agent is running/)).toBeTruthy();
    expect(screen.getByText(/WEIRD/)).toBeTruthy();
  });

  it('labels budget and input rejections, and falls back when reason is missing', () => {
    render(
      <OrchestratorPanel
        decisions={[
          { action: 'spawn_researcher', accepted: false, reason: 'BUDGET_EXHAUSTED' },
          { action: 'spawn_writer', accepted: false, reason: 'INVALID_INPUT' },
          { action: 'spawn_writer', accepted: false },
        ]}
      />,
    );
    expect(screen.getByText(/budget exhausted/)).toBeTruthy();
    expect(screen.getByText(/invalid input/)).toBeTruthy();
    expect(screen.getByText(/unknown/)).toBeTruthy();
  });

  it('shows the empty state without decisions', () => {
    render(<OrchestratorPanel />);
    expect(screen.getByText('No decisions yet')).toBeTruthy();
  });

  it('renders focus and streamed text as plain text', () => {
    const { container } = render(
      <OrchestratorPanel
        decisions={[{ action: 'spawn_researcher', accepted: true, spawn: 1, focus: '**bold** <b>x</b>' }]}
        text="# heading <i>y</i>"
      />,
    );
    expect(screen.getByText('**bold** <b>x</b>')).toBeTruthy();
    expect(screen.getByText('# heading <i>y</i>')).toBeTruthy();
    expect(container.querySelector('b, i, h1, strong')).toBeNull();
  });
});
