import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { resolveSelection, sameResolvedSkills, sameStringSet } from '../shared/selection';
import type { AppState, CatalogEntry, SyncResponse } from '../shared/types';

type FolderTarget = 'repository' | 'windows' | 'wsl';

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || response.statusText;
  } catch {
    return response.statusText;
  }
}

function statusLabel(syncing: boolean, dirty: boolean) {
  if (syncing) return 'Syncing';
  return dirty ? 'Unsynced changes' : 'Synced';
}

export function EntryRow({
  entry,
  selected,
  conflictedNames,
  onToggle,
}: {
  entry: CatalogEntry;
  selected: boolean;
  conflictedNames: Set<string>;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentsId = useId();
  const hasConflict =
    selected &&
    (entry.kind === 'skill'
      ? conflictedNames.has(entry.destinationName.toLocaleLowerCase('en-US'))
      : entry.skills.some((skill) => conflictedNames.has(skill.destinationName.toLocaleLowerCase('en-US'))));

  return (
    <li className={`entry ${selected ? 'entry--selected' : ''} ${hasConflict ? 'entry--conflict' : ''}`}>
      <div className="entry__header">
        <button className="entry__toggle" type="button" role="checkbox" aria-checked={selected} onClick={onToggle}>
          <span className="checkbox" aria-hidden="true">{selected ? '×' : ''}</span>
          <span className="entry__identity">
            <span className="entry__name">{entry.name}</span>
            <span className={`entry__kind entry__kind--${entry.kind}`}>{entry.kind}</span>
          </span>
          {entry.kind === 'pack' && <span className="entry__meta">{entry.skills.length} skills</span>}
        </button>
        {entry.kind === 'pack' && (
          <button
            className="entry__disclosure"
            type="button"
            aria-expanded={expanded}
            aria-controls={contentsId}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${entry.name}`}
            onClick={() => setExpanded((current) => !current)}
          >
            <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          </button>
        )}
      </div>
      {entry.kind === 'pack' && expanded && (
        <ul id={contentsId} className="pack-skills" aria-label={`${entry.name} bundled skills`}>
          {entry.skills.map((skill) => {
            const conflict = selected && conflictedNames.has(skill.destinationName.toLocaleLowerCase('en-US'));
            return (
              <li key={skill.relativePath} className={conflict ? 'pack-skill--conflict' : ''}>
                <span className="tree-rule" aria-hidden="true">└</span>
                <span>{skill.name}</span>
                {conflict && <span className="conflict-label">name conflict</span>}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [showClosePrompt, setShowClosePrompt] = useState(false);
  const hasLoaded = useRef(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const refresh = useCallback(async (initial = false) => {
    try {
      const response = await fetch('/api/state');
      if (!response.ok) throw new Error(await readError(response));
      const next = (await response.json()) as AppState;
      setState(next);
      setSyncing(next.syncing);
      setError(next.recoveryError);
      if (next.warning) setNotice(next.warning);
      const validIds = new Set(next.entries.map((entry) => entry.id));
      if (initial || !hasLoaded.current) {
        setSelected(new Set(next.initialSelection));
        hasLoaded.current = true;
      } else {
        setSelected(new Set([...selectedRef.current].filter((id) => validIds.has(id))));
      }
    } catch (refreshError) {
      setError((refreshError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
    const onFocus = () => void refresh(false);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const selection = useMemo(
    () => resolveSelection(state?.entries ?? [], selected),
    [state?.entries, selected],
  );
  const dirty = state
    ? !sameStringSet(selected, state.baselineSelection) ||
      !sameResolvedSkills(selection.resolvedSkills, state.baselineResolvedSkills) ||
      state.targetDrift
    : false;
  const effectiveSyncing = syncing || Boolean(state?.syncing);
  const wslAvailable = Boolean(state?.targets.find((target) => target.kind === 'wsl')?.available);
  const syncBlocked = effectiveSyncing || !wslAvailable || Boolean(state?.recoveryError) || selection.conflicts.length > 0;

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty && !effectiveSyncing) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, effectiveSyncing]);

  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('en-US');
    if (!needle) return state?.entries ?? [];
    return (state?.entries ?? []).filter(
      (entry) =>
        entry.name.toLocaleLowerCase('en-US').includes(needle) ||
        (entry.kind === 'pack' && entry.skills.some((skill) => skill.name.toLocaleLowerCase('en-US').includes(needle))),
    );
  }, [query, state?.entries]);

  const conflictNames = useMemo(
    () => new Set(selection.conflicts.map((conflict) => conflict.destinationName.toLocaleLowerCase('en-US'))),
    [selection.conflicts],
  );

  const toggleEntry = (entryId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  const post = useCallback(async (url: string, body: unknown) => {
    if (!state) throw new Error('The application is still loading.');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-clankerskills-csrf': state.csrfToken,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await readError(response));
    return response;
  }, [state]);

  const sync = async () => {
    if (syncBlocked) return;
    const snapshot = [...selected];
    setSyncing(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const response = await post('/api/sync', { selectedEntryIds: snapshot });
      const result = (await response.json()) as SyncResponse;
      setState((current) => current ? {
        ...current,
        baselineSelection: result.selectedEntries,
        baselineResolvedSkills: result.resolvedSkills,
        syncing: false,
      } : current);
      if (result.warnings.length > 0) setNotice(result.warnings.join(' '));
      await refresh(false);
    } catch (syncError) {
      setError((syncError as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === 'Enter' && !syncBlocked) {
        event.preventDefault();
        void sync();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const openFolder = async (target: FolderTarget) => {
    setError(undefined);
    try {
      await post('/api/open-folder', { target });
    } catch (openError) {
      setError((openError as Error).message);
    }
  };

  const retryRecovery = async () => {
    try {
      await post('/api/recover', {});
      await refresh(false);
    } catch (recoveryError) {
      setError((recoveryError as Error).message);
    }
  };

  const requestClose = () => {
    if (effectiveSyncing) return;
    if (dirty) setShowClosePrompt(true);
    else void closeApp();
  };

  const closeApp = async () => {
    setShowClosePrompt(false);
    try {
      await post('/api/shutdown', {});
      window.close();
    } catch (closeError) {
      setError((closeError as Error).message);
    }
  };

  if (loading || !state) {
    return <main className="loading-screen"><span>initializing catalog...</span></main>;
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">local agent tooling</div>
          <h1><span aria-hidden="true">[</span> Clankerskills <span aria-hidden="true">]</span></h1>
        </div>
        <button className="close-button" type="button" onClick={requestClose} disabled={effectiveSyncing} aria-label="Close Clankerskills">×</button>
      </header>

      <section className="status-strip" aria-live="polite">
        <span className={`status-dot status-dot--${effectiveSyncing ? 'syncing' : dirty ? 'dirty' : 'synced'}`} />
        <strong>{statusLabel(effectiveSyncing, dirty)}</strong>
        <span className="repository-path" title={state.repositoryPath}>{state.repositoryPath}</span>
      </section>

      {(error || notice || selection.conflicts.length > 0) && (
        <section className={`message ${error || selection.conflicts.length ? 'message--error' : 'message--notice'}`}>
          <span>{error ?? (selection.conflicts.length > 0
            ? `${selection.conflicts.length} flattened skill name conflict${selection.conflicts.length === 1 ? '' : 's'} must be resolved before Sync.`
            : notice)}</span>
          {state.recoveryError && <button type="button" onClick={() => void retryRecovery()}>retry recovery</button>}
        </section>
      )}

      <section className="toolbar">
        <label className="search-box">
          <span aria-hidden="true">/</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="filter skills and packs" aria-label="Filter skills and packs" autoFocus />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search">×</button>}
        </label>
        <div className="counts">
          <span>{selected.size} entries</span>
          <span>{selection.resolvedSkills.length} skills</span>
        </div>
      </section>

      <section className="catalog" aria-label="Skill catalog">
        {filteredEntries.length === 0 ? (
          <div className="empty-state">No matching Skills or Packs.</div>
        ) : (
          <ul className="entry-list">
            {filteredEntries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                selected={selected.has(entry.id)}
                conflictedNames={conflictNames}
                onToggle={() => toggleEntry(entry.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <footer className="app-footer">
        <div className="folder-actions" aria-label="Open folders">
          <button type="button" onClick={() => void openFolder('repository')}>repository</button>
          <button type="button" onClick={() => void openFolder('windows')}>windows active</button>
          <button type="button" onClick={() => void openFolder('wsl')} disabled={!state.targets.find((target) => target.kind === 'wsl')?.available}>wsl active</button>
        </div>
        {effectiveSyncing && <div className="progress-track"><span /></div>}
        <button className={`sync-button ${dirty ? 'sync-button--dirty' : ''}`} type="button" onClick={() => void sync()} disabled={syncBlocked}>
          <span>{effectiveSyncing ? 'Syncing snapshot...' : !wslAvailable ? 'Default WSL distro required' : selection.conflicts.length ? 'Resolve conflicts to sync' : dirty ? 'Sync changes' : 'Sync again'}</span>
          <kbd>ctrl ↵</kbd>
        </button>
      </footer>

      {showClosePrompt && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="close-title">
            <div className="eyebrow">discard selection</div>
            <h2 id="close-title">Close with unsynced changes?</h2>
            <p>Your checkbox changes have not been applied to either active Skills folder.</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setShowClosePrompt(false)}>Keep working</button>
              <button className="danger-button" type="button" onClick={() => void closeApp()}>Discard and close</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
