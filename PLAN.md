# Clankerskills

## Purpose

Build a simple Windows-native GUI for managing which personal coding-agent skills are currently active, without cluttering agent context with every saved skill.

## Core Model

- The authoritative skill repository lives in a Windows folder, `C:\Users\<user>\.agent-skill-repo`.
- Every immediate non-hidden child directory in the repository is considered a skill.
- Dot-prefixed files or directories such as `.git` are ignored.
- Skill contents are opaque to the tool; folders may contain arbitrary files.
- Edits to skills happen only in the authoritative repository.
- Active skill folders are generated and ephemeral.

## Active Targets

The tool owns the full contents of the default active skills folders:

- Windows: `C:\Users\<user>\.agents\skills`
- WSL: the detected default distro's `~/.agents\skills`

The app should autodetect the WSL distro and continue to work if the default distro changes later.

## Selection State

- The selected active skill set is stored in a config file inside the authoritative repository, e.g. `.skill-selector.json`.
- Windows and WSL should always share the same selected active skill set.
- If a selected skill is deleted from the repository, it disappears from the UI, is implicitly unchecked, and is removed from active folders on the next sync.

## UI

- Alphabetical list of skills.
- Search box filter.
- Checkbox per skill to activate or deactivate.
- Clear indication when the current UI selection has unsynced changes.
- `Sync` button applies the current selection to both active targets.
- Useful actions:
  - open repository folder
  - open active Windows folder
  - open active WSL folder

## Sync Behavior

- Sync uses a frozen snapshot of the selection from the moment `Sync` is pressed.
- The user may continue changing checkboxes while sync is running.
- Changes made during sync are not included in the running sync.
- The `Sync` button is disabled while syncing.
- Sync empties the contents of each active skills folder and copies in the selected skill folders, preserving the parent folder itself.

## Visible App States

- `Synced`: current UI selection matches the last successfully synced state.
- `Unsynced changes`: current UI selection differs from the last successfully synced state.
- `Syncing`: a sync is currently applying a frozen selection snapshot.

When sync finishes, the app re-evaluates whether the current UI selection is synced or unsynced.

## Close Behavior

- Closing with unsynced changes should prompt before discarding them.
- Closing while sync is running should be blocked for v1 to avoid ambiguous partial state.

