// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EntryRow } from '../src/client/App';
import type { PackEntry } from '../src/shared/types';

const pack: PackEntry = {
  kind: 'pack',
  id: 'pack:toolbox',
  name: 'toolbox',
  skills: [
    { name: 'alpha', relativePath: 'toolbox/alpha', destinationName: 'alpha' },
    { name: 'beta', relativePath: 'toolbox/beta', destinationName: 'beta' },
  ],
};

describe('Pack catalog row', () => {
  it('is collapsed by default and expands independently of selection', () => {
    const onToggle = vi.fn();
    render(
      <ul>
        <EntryRow entry={pack} selected={false} conflictedNames={new Set()} onToggle={onToggle} />
      </ul>,
    );

    expect(screen.queryByRole('list', { name: 'toolbox bundled skills' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand toolbox' }));
    expect(screen.getByRole('list', { name: 'toolbox bundled skills' })).toBeTruthy();
    expect(screen.getByText('alpha')).toBeTruthy();
    expect(onToggle).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse toolbox' }));
    expect(screen.queryByRole('list', { name: 'toolbox bundled skills' })).toBeNull();
  });
});

