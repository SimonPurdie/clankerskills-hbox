# Clankerskills

Clankerskills is a Windows-hosted local web application for choosing which personal coding-agent Skills are active in Windows and the current default WSL distro.

## Repository layout

The authoritative repository is `%USERPROFILE%\.agent-skill-repo`.

- A non-hidden top-level folder containing `SKILL.md` is a standalone Skill.
- A top-level folder without `SKILL.md` is a Pack when one or more of its immediate child folders contain `SKILL.md`.
- Packs are selected as one unit. Their child Skills are flattened into the active target folders.
- Detection stops after the Pack's immediate children.

The application owns the contents of:

- `%USERPROFILE%\.agents\skills`
- `~/.agents/skills` in the default WSL distro

## Windows setup

Run dependency and build commands with Windows Node, even when working from WSL:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

HBOX starts the production server with `npm run start` and opens <http://127.0.0.1:43127> after the health endpoint is ready.

## Development

The frontend and backend can be run separately:

```powershell
npm.cmd run dev:server
npm.cmd run dev:client
```

The Vite development server proxies API requests to the backend. Production serves the compiled frontend from the Fastify process.

The selector state and interrupted-sync journal are stored as hidden files inside the authoritative repository. A sync stages both targets before changing either, retains backups until both commits and the config write succeed, and recovers or rolls back an interrupted transaction on the next launch.
