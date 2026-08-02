# MOTIF WALK — Implementation Plan

A research and writing environment that walks Wikipedia/Wikidata, asks an LLM to
select and warrant historically significant nodes, renders them as an editable
flowchart, and composes a Burkean (endpoint-first, backward-planned,
forward-written) Draft 0 beside it.

Product invariant: **the random walk discovers adjacency; the backward planner
discovers explanatory necessity; the verifier discovers whether that necessity
is historical, analogical, or merely narratively seductive.**

## Stack

- Next.js 16 (App Router), TypeScript strict, React 19
- Tailwind CSS 4 (design tokens in `globals.css` via `@theme`)
- React Flow (`@xyflow/react`) for the graph canvas
- Zustand for transient client state, TanStack Query for server state
- SQLite + Prisma 7 (driver adapter `@prisma/adapter-better-sqlite3`)
- Zod 4 for all structured-output validation and configuration schemas
- Vitest for unit/integration tests
- LLM access behind a `LanguageModelProvider` interface; Anthropic is the first
  implementation, a deterministic mock provider ships first and powers tests

Deviation from the original spec, with rationale:

- **shadcn/ui is not used.** The design language (Windows 3.x / early
  HyperCard: beveled controls, indigo title bars, pale gray work surface) is
  far from shadcn's defaults; restyling every shadcn primitive costs more than
  hand-rolling a small set of retro primitives (`src/components/ui/`). Revisit
  if the component inventory grows past what a small kit covers.
- **TipTap deferred to Phase 5.** Phase 1 ships the Draft 0 panel as a
  structured read-only region with an honest empty state; the editor arrives
  with real segments.

## Phases

### Phase 1 — repository and shell  ✅ (this phase)

- [x] Next.js app, strict TS, Tailwind
- [x] Prisma schema covering the full domain (WalkProject, SourceNode,
      NarrativeNode, NarrativeEdge, DraftSegment, GenerationJob) so later
      phases migrate rather than reinvent
- [x] Project creation, listing, reopening (persisted; survives refresh)
- [x] Three-panel workbench layout: configuration (top), flowchart (left),
      Draft 0 (right), evidence/transition inspector (bottom)
- [x] Empty React Flow canvas with honest empty state
- [x] Empty Draft 0 region with honest empty state
- [x] Full configuration form (walk mode, start, endpoint strategy, walk
      parameters, criteriological weights, path description,
      historical-consciousness checkboxes) — persisted via PATCH
- [x] Actions that are not yet implemented are rendered disabled with the
      phase in which they activate; no placebo buttons
- [x] Unit tests: configuration schema defaults/validation; project
      create → reopen round trip against a real temp SQLite database
- [x] CLAUDE.md, .claude/agents (graph-engineer, historical-method-reviewer,
      test-engineer), .claude/skills/verify-motif-walk

**Acceptance:** the user can create and reopen a persisted project.

### Phase 2 — Wikipedia random walk

- MediaWiki Action API integration (resolution, links, extracts, metadata,
  categories) with response caching keyed by canonical identifier, polite
  throttling, descriptive User-Agent
- Exclusion rules (disambiguation/list/category pages, min length, revisits)
- Deterministic seeded PRNG (seedrandom); never `Math.random()`
- Walk engine: bounded requests, visited-node list, SourceNode persistence
- Raw flowchart of the visited path
- Job table + streaming progress for the long-running walk route

**Acceptance:** same seed + configuration ⇒ same path.

### Phase 3 — criteriological walk

- Candidate feature extraction and normalization to [0, 1]
- Weighted scoring with repetition penalty; greedy + weighted sampling
  (beam behind a feature flag, interface only)
- Optional LLM rerank of the top deterministic candidates only
- Three candidate paths, path-level scores, comparison screen
- Per-step "why this node" explanation surfaced in the UI

**Acceptance:** the UI shows why every next node was selected.

### Phase 4 — significance orchestration

- Candidate-node dossiers (fetched facts / inferred metadata / LLM
  interpretation kept distinct)
- Stage 1 endpoint selection, Stage 2 backward Burke plan, Stage 3 adversarial
  transition verifier — all Zod-validated structured output; on invalid
  output: preserve raw response, retry once with errors, fail visibly
- Typed edges with warrant class, carrier, pressures, evidence, confidence
- Rejected edges stay visible (red, dashed) until replaced or removed

**Acceptance:** every retained edge has carrier, warrant class, pressure
transformation, and confidence.

### Phase 5 — Draft 0

- Stage 4 forward composition obeying the Burkean rules
- TipTap editor, segment boundaries, node/edge badges
- Graph ↔ prose synchronized selection; "Draft is out of sync" flow
- Segment regeneration that never silently overwrites user-edited segments

**Acceptance:** editing one paragraph and regenerating another does not alter
the edited paragraph.

### Phase 6 — historical-consciousness layer

- Actor horizon, later canonical interpretation, present-day motif, immanent
  complication rendered distinctly in inspector and motif overlay

**Acceptance:** the interface visibly distinguishes an actor-level category
from a later historiographical motif.

### Phase 7 — export and tests

- Project JSON (lossless reimport), Markdown draft, Mermaid flowchart,
  CSV node/edge lists
- Seed demonstration fixture (touchstone → … → radar/nuclear physics) with no
  live API or LLM calls
- End-to-end tests over the full journey with mocked externals

**Acceptance:** exported JSON reimports without losing layout, evidence,
segmentation, or user edits.

## Remaining risks (updated per phase)

- `npm audit` reports 3 high advisories, all transitive inside
  `next@16.2.12` (its pinned `postcss` and `sharp`); no fix without changing
  Next versions. Track upstream.
- Prisma 7's new client architecture (driver adapters, `prisma.config.ts`) is
  newer than Prisma 6's battle-tested path; if it misbehaves under Next.js
  bundling, fall back to Prisma 6 — the schema is version-compatible.
- Wikipedia link retrieval (Phase 2) is paginated and rate-limited; the
  request-budget accounting must count HTTP requests, not logical operations,
  or the budget will be fiction.
- LLM rerank cost control (Phase 3) depends on the deterministic pre-filter
  being good enough that the model only ever sees a small candidate slate.
- Graph ↔ prose sync (Phase 5) needs stable segment↔node/edge identity across
  regenerations; the schema reserves those foreign keys now.
