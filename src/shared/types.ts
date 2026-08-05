export type EntryKind = 'skill' | 'pack';

export interface PackedSkill {
  name: string;
  relativePath: string;
  destinationName: string;
}

export interface StandaloneSkillEntry {
  kind: 'skill';
  id: string;
  name: string;
  relativePath: string;
  destinationName: string;
}

export interface PackEntry {
  kind: 'pack';
  id: string;
  name: string;
  skills: PackedSkill[];
}

export type CatalogEntry = StandaloneSkillEntry | PackEntry;

export interface ResolvedSkill {
  entryId: string;
  sourceRelativePath: string;
  destinationName: string;
}

export interface DestinationConflict {
  destinationName: string;
  sources: ResolvedSkill[];
}

export interface TargetInfo {
  kind: 'windows' | 'wsl';
  path: string;
  available: boolean;
  detail?: string;
}

export interface AppState {
  entries: CatalogEntry[];
  initialSelection: string[];
  baselineSelection: string[];
  baselineResolvedSkills: ResolvedSkill[];
  targets: TargetInfo[];
  repositoryPath: string;
  syncing: boolean;
  targetDrift: boolean;
  csrfToken: string;
  warning?: string;
  recoveryError?: string;
}

export interface SyncResponse {
  selectedEntries: string[];
  resolvedSkills: ResolvedSkill[];
  warnings: string[];
}

export interface SelectorConfig {
  version: 1;
  selectedEntries: string[];
  resolvedSkills: ResolvedSkill[];
  syncId: string;
  wslDistro: string;
  wslHome: string;
}
