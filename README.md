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

**Phases 1–3.5 complete: shell + deterministic random walk +
criteriological walk + BurkeWalker (Gemini-powered).**

New in Phase 3.5:

- **Burke walker mode** — the walker maintains a provisional, falsifiable,
  evolving **theory of your seed**, and selects each next page by asking
  *what the current story cannot explain* — never what resembles the seed.
  Each step diagnoses the most consequential deficiency, chooses the Burke
  question that addresses it (precondition / problem / selection /
  transformation / analogy / recoding), and phrases a precise navigation
  question **before** any candidate is collected. Candidates are then ranked
  by explanatory gain — with penalties for lexical resemblance, carrier-less
  analogy, redundancy, generic abstraction, sensational detours, and
  seed-forcing — and must pass an acceptance gate and yield a narrative
  bridge that stands without mentioning the seed. Every accepted node
  rewrites the theory contrastively. Coherence tests and backtracking pull
  the walk out of dead branches; theory checkpoints end it at saturation;
  the real stopping condition is redescription. The right panel exposes the
  whole apparatus
- **Anamnetic mode** — endpoint-first. You supply a **terminal sentence**:
  a felt ending you want to be able to say and have land. The walker
  decomposes it into *charges* (the words, claims, feelings, and rhetorical
  turns carrying its force) and works out the **debts** each charge incurs —
  what a reader must already possess for it to land rather than fall flat.
  Each step selects a debt, phrases the archival question that would settle
  it, and judges candidates by what they would *pay*: a page must supply a
  concrete anchor and earn the charge rather than restate it, and no debt
  may be settled in full on analogy alone. Partial payments declare their
  residue, which breeds the next debt. The sentence is periodically re-read
  — what lands, what still falls flat — and the walk ends when it becomes
  *inhabitable*, not when pages run out. The composition is then ordered for
  preparation rather than discovery and closes on your sentence verbatim
- **BurkeCluster mode** — discovers narrative *subjects* rather than pages.
  Your seed is the provisional **ending**; the walker samples the archive
  outward with a mixture of stochastic walk policies, builds a local graph
  (outlinks, shared neighbours, reciprocity, Wikidata relations, each kept
  with its provenance), and detects concentrations with multi-resolution
  Louvain plus personalized PageRank and betweenness. It then asks what
  historical subject *organizes* each concentration — preferring "carnival"
  to "collective behavior", "the office of the herald" to "authority".
  Crucially the route is still governed by deficiency: each accepted subject
  is narrated, its predicates extracted, and the predicate it leaves
  unexplained selects the next search **before** any sampling happens. The
  next subject is that predicate raised into a subject of its own —
  *incipit subjectum* — and a pivot that cannot say why its subject was
  latent in the previous narration is rejected. The narrative is composed in
  reverse discovery order, opening on an ordinary scene and culminating in
  your seed; the Cluster Atlas, Discovery Trace, and transition table keep
  the computation inspectable beside it
- **Motif modules** (Authenticity under Mechanization; Authority) —
  reusable ways of becoming curious, not topics
- **Gemini provider** (`GEMINI_API_KEY`, optional `GEMINI_MODEL`, default
  gemini-2.5-flash): the first live implementation of the provider
  interface. Structured outputs are Zod-validated; invalid output is
  retried once with the validation errors, then fails visibly with the raw
  response preserved. Without the key, Burke walks fail loudly — nothing is
  invented

New in Phase 3:

- **Criteriological mode**: candidates are enriched from Wikidata (entity
  types, eras, coordinates, sitelinks, documented claim links) and scored
  deterministically against your sixteen criteria weights, with a repetition
  penalty against type/century/biography monotony. Greedy, weighted, and
  exploratory (softmax) sampling
- **Three candidate paths** per generation, each with path-level scores
  (documented relations, novelty, diversity, transition variety, concrete
  carriers, endpoint strength, redundancy) — compare and choose; the chosen
  path materializes into the flowchart
- **Why every node**: the inspector shows the chosen node's score breakdown
  (feature × weight contributions), its runner-ups with scores, and every
  excluded candidate with its reason
- Temporal bounds and the popularity cap are live (popularity approximated
  by Wikidata sitelink count — the tooltip says so); criteria that need
  historical judgment are marked * and reserved for the Phase 4 LLM rerank

Working now:

- Project creation, listing, and reopening, persisted in SQLite
- **Generate walk**: resolves the starting point (exact title, URL,
  free-text topic, or random article), then walks live Wikipedia with a
  seeded PRNG — same seed and configuration always reproduce the same path.
  Exclusion rules drop disambiguation/list/calendar pages and short stubs;
  a hard request budget bounds API usage; polite throttling and a
  descriptive User-Agent keep the client well-behaved
- **Regenerate with same seed** reproduces the previous path (including a
  previously random start)
- The visited path renders in the flowchart with edges labeled ADJACENCY —
  a hyperlink hop is never presented as historical warrant. Clicking a node
  opens its dossier in the inspector: summary, categories, Wikidata id, and
  the audited candidate pool (what else was considered, what was excluded
  and why)
- Walks run as background jobs with live progress in the UI
- `WIKIPEDIA_MODE=fixture` swaps live Wikipedia for a deterministic
  demonstration graph (touchstone → coinage → … → radar) for offline
  development and tests
- The three-panel workbench, full configuration form, domain schema for the
  entire pipeline, and the `LanguageModelProvider` interface with a
  deterministic mock provider

Actions for later phases (Re-score, Compose, Export) stay disabled and say
which phase activates them. See [PLAN.md](PLAN.md) for the roadmap.

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

The app is deployed through Fly's **Launch an App from GitHub** flow, which
builds the repository Dockerfile on Fly's builders and redeploys on push to
`main`. `fly.toml` carries the app name (`walkengine`), the `/data`
volume mount, forced HTTPS, and a health check on `/api/projects`. In the
launcher, leave env vars, Postgres, working directory, and config path at
their defaults — the fly.toml is at the repo root and SQLite needs no
managed database.

Keep the app at **exactly one machine** (Machines tab): two machines would
get two separate SQLite volumes and silently split projects between them.

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
