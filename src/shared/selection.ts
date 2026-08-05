import type { CatalogEntry, DestinationConflict, ResolvedSkill } from './types';

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function compareNames(a: string, b: string): number {
  return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

export function resolveSelection(entries: CatalogEntry[], selectedIds: Iterable<string>): {
  resolvedSkills: ResolvedSkill[];
  conflicts: DestinationConflict[];
  unknownIds: string[];
} {
  const selected = new Set(selectedIds);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const unknownIds = [...selected].filter((id) => !byId.has(id)).sort(compareNames);
  const resolvedSkills: ResolvedSkill[] = [];

  for (const entry of entries) {
    if (!selected.has(entry.id)) continue;
    if (entry.kind === 'skill') {
      resolvedSkills.push({
        entryId: entry.id,
        sourceRelativePath: entry.relativePath,
        destinationName: entry.destinationName,
      });
      continue;
    }
    for (const skill of entry.skills) {
      resolvedSkills.push({
        entryId: entry.id,
        sourceRelativePath: skill.relativePath,
        destinationName: skill.destinationName,
      });
    }
  }

  resolvedSkills.sort((a, b) =>
    compareNames(a.destinationName, b.destinationName) ||
    compareNames(a.sourceRelativePath, b.sourceRelativePath),
  );

  const groups = new Map<string, ResolvedSkill[]>();
  for (const skill of resolvedSkills) {
    const key = skill.destinationName.toLocaleLowerCase('en-US');
    const group = groups.get(key) ?? [];
    group.push(skill);
    groups.set(key, group);
  }

  const conflicts = [...groups.values()]
    .filter((sources) => sources.length > 1)
    .map((sources) => ({ destinationName: sources[0].destinationName, sources }))
    .sort((a, b) => compareNames(a.destinationName, b.destinationName));

  return { resolvedSkills, conflicts, unknownIds };
}

export function sameStringSet(a: Iterable<string>, b: Iterable<string>): boolean {
  const left = [...new Set(a)].sort(compareNames);
  const right = [...new Set(b)].sort(compareNames);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function sameResolvedSkills(a: ResolvedSkill[], b: ResolvedSkill[]): boolean {
  const key = (skill: ResolvedSkill) =>
    `${skill.entryId}\u0000${skill.sourceRelativePath}\u0000${skill.destinationName}`;
  const left = a.map(key).sort(compareNames);
  const right = b.map(key).sort(compareNames);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

