# MOTIF WALK — Cultural Memory Workbench

A research and writing environment that generates random or criteriologically
constrained walks through Wikipedia/Wikidata, asks an LLM to select and warrant
the walk's historically significant nodes, renders them as an editable
flowchart, and composes a Burkean Draft 0 beside it — beginning from the chosen
endpoint, working backward through enabling conditions, then rewriting the
chain forward as an interconnected narrative.

This is not a Wikipedia summarizer. The product invariant:

> The random walk discovers adjacency; the backward planner discovers
> explanatory necessity; the verifier discovers whether that necessity is
> historical, analogical, or merely narratively seductive.

Documented historical relations are always distinguished from interpretive,
analogical, and speculative transitions.

## Status

**Phase 1 (repository and shell) — complete.**

Working now:

- Project creation, listing, and reopening, persisted in SQLite (a project
  survives a browser refresh and a server restart)
- The three-panel workbench: walk configuration (top), editable flowchart
  canvas (left), Draft 0 (right), evidence/transition inspector (bottom)
- The full walk-configuration form — walk mode, starting point, endpoint
  strategy, walk parameters, sixteen criteriological weights, path
  description, historical-consciousness controls — validated by Zod and
  persisted per project
- Domain schema for the entire pipeline (source nodes, narrative nodes, typed
  edges with warrant classes, draft segments, generation jobs)
- `LanguageModelProvider` interface with a deterministic mock provider that
  never invents unregistered content

Buttons for later phases (Generate walk, Re-score, Compose, Export) are
rendered disabled and say which phase activates them. See [PLAN.md](PLAN.md)
for the phase roadmap and remaining risks.

## Getting started

```bash
npm install
npx prisma migrate dev   # creates ./dev.db and generates the client
npm run dev              # http://localhost:3000
```

Copy `.env.example` to `.env` if it does not exist. `ANTHROPIC_API_KEY` /
`ANTHROPIC_MODEL` are unused until Phase 4; no live LLM calls exist yet.

## Scripts

| Command             | Purpose                                |
| ------------------- | -------------------------------------- |
| `npm run dev`       | Development server                     |
| `npm run build`     | Production build                       |
| `npm run lint`      | ESLint                                 |
| `npm run typecheck` | `tsc --noEmit` (strict mode)           |
| `npm test`          | Vitest (uses a temp SQLite database)   |

## Deployment

The app is a single Next.js server with a file-backed SQLite database, so it
deploys anywhere that offers a **persistent disk**: Docker on a VPS,
Fly.io, Railway, Render, a home server. It is responsive — the workbench is a
fixed three-panel surface on desktop and stacks into a scrolling column on
phones — and ships a web-app manifest, so it can be installed to a phone or
desktop home screen from the browser menu.

### Fly.io (continuous deploy from GitHub)

The repo ships `fly.toml` and `.github/workflows/fly-deploy.yml`. One-time
setup, no local CLI required:

1. Create a Fly deploy token (Fly dashboard → Tokens, or `fly tokens create deploy`).
2. Add it as a GitHub Actions secret named `FLY_API_TOKEN`
   (repo → Settings → Secrets and variables → Actions).

Every push to a deploy branch then builds the Dockerfile on Fly's builders,
creates the app and the `/data` volume on first run, and deploys a single
machine (`--ha=false` — required, since two machines would get two separate
SQLite volumes). The app comes up at `https://<app-name>.fly.dev`. App name
and region live at the top of `fly.toml` and the workflow's `env` block —
change both together.

### Docker (recommended for self-hosting)

```bash
docker build -t motif-walk .
docker run -d -p 3000:3000 -v motif-walk-data:/data motif-walk
# or: docker compose up -d
```

The entrypoint runs `prisma migrate deploy` against the volume on every boot
(a no-op when up to date), so a fresh volume boots straight into a working
app and schema upgrades apply themselves on redeploy. The database lives at
`/data/motif-walk.db` on the named volume; back it up by copying that file.

Set `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` via environment (compose file or
`docker run -e`) once Phase 4 lands; nothing reads them yet.

### Bare Node

```bash
npm ci && npx prisma generate && npm run build
DATABASE_URL="file:/var/lib/motif-walk/motif-walk.db" npx prisma migrate deploy
DATABASE_URL="file:/var/lib/motif-walk/motif-walk.db" npx next start -H 0.0.0.0 -p 3000
```

Put a TLS-terminating reverse proxy (Caddy, nginx) in front for anything
non-local — the manifest and phone installation require HTTPS in practice.

### What does not work

Serverless platforms without persistent disks (e.g. Vercel's default
runtime) will lose the SQLite file between invocations. Deploying there
would require swapping the Prisma datasource to a hosted database (Turso,
Postgres); the schema is compatible, but that swap is deliberately out of
scope for the MVP.

## Architecture

- **Next.js 16 (App Router), React 19, TypeScript strict**
- **Tailwind CSS 4** — design tokens in `src/app/globals.css`; the visual
  language is an early graphical workstation (pale gray surface, muted indigo
  title bars, beveled controls), not a dashboard and not an archive
- **SQLite + Prisma 7** (`better-sqlite3` driver adapter); every walk, node,
  LLM result, transition, draft segment, and user edit is persisted —
  expensive material is never regenerated because a browser refreshed
- **React Flow** for the graph canvas, **Zustand** for transient client
  state, **TanStack Query** for server state
- **Zod** validates all configuration and (from Phase 4) all LLM structured
  output; stored JSON is re-validated on read so drift fails loudly

```
src/
  app/            routes and API handlers
  components/     configuration / flowchart / draft / inspector / ui
  domain/         canonical enums and domain vocabulary
  integrations/   llm provider interface + mock (wikipedia/wikidata: Phase 2)
  schemas/        Zod schemas
  server/         Prisma client and services (no UI imports)
  state/          Zustand stores
  tests/          Vitest suites
prisma/           schema and migrations
.claude/          project subagents and verification skill
```

Development rules, including the historical-method invariants every narrative
edge must satisfy, live in [CLAUDE.md](CLAUDE.md).
