import { describe, expect, it } from 'vitest';
import { resolveSelection, sameResolvedSkills, sameStringSet } from '../src/shared/selection';
import type { CatalogEntry } from '../src/shared/types';

const entries: CatalogEntry[] = [
  { kind: 'skill', id: 'skill:alpha', name: 'alpha', relativePath: 'alpha', destinationName: 'alpha' },
  {
    kind: 'pack',
    id: 'pack:tools',
    name: 'tools',
    skills: [
      { name: 'beta', relativePath: 'tools/beta', destinationName: 'beta' },
      { name: 'ALPHA', relativePath: 'tools/ALPHA', destinationName: 'ALPHA' },
    ],
  },
];

describe('resolveSelection', () => {
  it('flattens a whole pack', () => {
    const result = resolveSelection(entries, ['pack:tools']);
    expect(result.resolvedSkills.map((skill) => skill.destinationName)).toEqual(['ALPHA', 'beta']);
    expect(result.conflicts).toEqual([]);
  });

  it('blocks case-insensitive destination conflicts', () => {
    const result = resolveSelection(entries, ['skill:alpha', 'pack:tools']);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].sources.map((source) => source.entryId)).toEqual(['pack:tools', 'skill:alpha']);
  });

  it('reports stale identities and compares snapshots as sets', () => {
    expect(resolveSelection(entries, ['pack:missing']).unknownIds).toEqual(['pack:missing']);
    expect(sameStringSet(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameResolvedSkills([], [])).toBe(true);
  });
});

