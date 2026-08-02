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

Phase 1 addendum — deployment and mobile:

- [x] Dockerfile + docker-compose + migration entrypoint; SQLite on a
      mounted `/data` volume, `prisma migrate deploy` on every boot
- [x] Responsive workbench: fixed three-panel surface on desktop (lg+),
      stacked scrolling column on phones; 16px inputs on small screens so
      iOS Safari does not zoom on focus
- [x] Web-app manifest + generated icons; installable to a phone or desktop
      home screen (no service worker by design — offline caching of a
      database-backed workbench would misrepresent persisted state)

### Phase 2 — Wikipedia random walk  ✅

- [x] MediaWiki Action API gateway: resolution (title/URL/topic/random),
      outgoing links with capped continuation, batched info/extracts,
      per-process response cache, polite serial requests, descriptive
      User-Agent
- [x] Exclusion rules: disambiguation, list/index/outline/timeline pages,
      calendar pages, min article length, revisit prevention
- [x] Deterministic seeded PRNG (in-repo xmur3+sfc32 pinned by golden-value
      tests — equivalent to seedrandom, zero-dependency); never
      `Math.random()`
- [x] Walk engine over a gateway interface: hard request budget (counts HTTP
      requests, aborts gracefully keeping progress), candidate pools recorded
      per hop with exclusion reasons
- [x] Raw flowchart of the visited path with edges labeled ADJACENCY (never
      warrant); node click → inspector dossier (summary, categories,
      Wikidata id, candidate pool audit)
- [x] GenerationJob table + background job execution + UI polling with live
      progress
- [x] Deterministic fixture gateway (`WIKIPEDIA_MODE=fixture`) mirroring the
      demonstration chain, powering tests and offline development

**Acceptance (met):** same seed + configuration ⇒ same path — verified at
engine level, service level, and over HTTP.

Deferred within Phase 2, honestly surfaced in the UI as disabled fields:
max popularity percentile (needs pageview data), temporal/geographic bounds
(need Wikidata metadata) — both arrive with Phase 3 enrichment.

### Phase 3 — criteriological walk  ✅

- [x] Wikidata enrichment gateway (wbgetentities): instance-of labels,
      era years, coordinates, sitelink counts, claim-target QIDs; shares one
      RequestBudget with the Wikipedia gateway
- [x] 11-feature candidate vector, every feature normalized to [0, 1];
      unknown metadata is neutral (0.5), never a punishment
- [x] Weighted scoring: user criteria map to deterministic features via a
      documented matrix; LLM-only criteria (material dependency, conceptual
      inheritance, …) are marked * in the UI and reserved for the Phase 4
      rerank — they never pretend to be measured deterministically
- [x] Repetition penalty (repeated entity type, crowded century,
      biography-heavy paths) subtracted from the weighted sum
- [x] Hard bounds: temporal (excludes only on positive evidence) and
      popularity cap (documented sitelink-count approximation)
- [x] Sampling: greedy, weighted, exploratory (softmax); beam interface
      feature-flagged off and refuses loudly
- [x] Three seeded candidate paths per generation (seed::A/B/C) with
      path-level PathScore; comparison screen; choosing materializes
      SourceNodes losslessly from stored JSON
- [x] Per-hop "why this node": score breakdown, top contributions,
      runner-ups, and exclusion reasons in the inspector; score chips on
      flowchart nodes
- [x] rerank-candidates.v1 prompt stored (invocation lands with Phase 4)

**Acceptance (met):** the UI shows why every next node was selected — the
inspector renders the chosen node's score breakdown, its runner-ups with
scores, and every exclusion with its reason.

Still deferred: geographic bounds (free-text region needs resolution against
coordinates — Phase 4+), LLM rerank invocation (needs the live provider).

### Phase 3.5 — BurkeWalker mode + Gemini provider  ✅ (user-requested)

The provider decision changed by user request: **Gemini** (via
`GEMINI_API_KEY` / `GEMINI_MODEL`, default gemini-2.5-flash) is the first
live `LanguageModelProvider` implementation, not Anthropic. The interface
is unchanged; Phase 4 orchestration will ride the same provider.

- [x] GeminiProvider: JSON mode, Zod-validated structured output, raw
      response preserved on failure, exactly one retry carrying the
      validation errors, then loud failure — no silent coercion
- [x] BURKE walk mode — a curiosity program, not a weight vector:
      - Seed (OBJECT or QUESTION, the user's lived experience)
      - Curiosity priming → salience weights (LLM "prime" stage; motif
        modules merge their sensitivity in)
      - The six-question grammar (PRECONDITION / PROBLEM / SELECTION /
        TRANSFORMATION / ANALOGY / RECODING) — the walker never asks
        arbitrary questions
      - Move criteria per candidate (novelty, historical depth, narrative
        tension, conceptual fit, explanatory gain, return potential) with
        the discard rule: no return potential → no traversal, enforced by
        the engine, not just suggested
      - Four-field notes (observation / question / changed understanding /
        return to seed) — narrative compression, never explanations
      - Narrative elasticity: every N pages a three-sentence story;
        stable story ⇒ explanatory saturation stop
      - Stopping condition is redescription (or saturation); maxPages is
        an honestly-labeled safety cap
- [x] Motif presets as behavioral modules (Authenticity under
      Mechanization; Authority) — sensitivity, preferred questions,
      stopping condition
- [x] Versioned prompt files (burke-prime/step/elasticity/recode v1)
- [x] BurkeRun persistence; journal UI (salience, notes, checkpoints,
      final recoding); FixtureBurkeOracle for tests/offline mode
- Note: Burke walks are NOT seed-reproducible even at temperature 0 — the
  oracle is a live model. The rng governs candidate pool sampling only.

### Phase 3.6 — BurkeWalker revision: story-state control  ✅ (user-requested)

The first BurkeWalker behaved as a thematic-association engine: it extracted
weighted concepts from the priming, scored pages by semantic fit, and forced
every page into a return-to-seed reading. That produces forced resemblances,
not a cumulative explanatory thread. The revision inverts the control flow.

**The governing instruction:** the walker selects the next page by asking
what the current story cannot explain — never by asking what resembles the
seed.

- [x] **StoryState** — persistent, falsifiable, evolving: current theory and
      its version history (with change type, what changed, why), unresolved
      questions (typed, prioritized, with status), established claims,
      rejected hypotheses, unexplained remainder, current tension, return
      paths, mystery state, saturation estimates
- [x] **Structured CuriosityProgram** replaces weighted keywords: matters of
      concern, preferred mechanisms and historical relations, desired
      tensions, comparison dimensions, and `avoidPatterns` — the specific
      weak analogies this seed will attract
- [x] **Diagnostic question selection**: each step diagnoses the story's most
      consequential deficiency, chooses the Burke question that addresses it
      (conditionally, never by rotation), and phrases one precise navigation
      question — all BEFORE any candidate is collected
- [x] **Candidate generation separated from selection**: outgoing links plus
      Wikipedia search over question-derived phrases (generation seeks
      possibilities; selection seeks explanatory gain)
- [x] **Explanatory-gain ranking** with the brief's weight hierarchy;
      lexical similarity without gain, analogy-only, redundancy, generic
      abstraction, sensational detour, and seed-forcing are all penalties.
      Totals are computed by the engine, not the model. An analogy claiming
      no carrier is auto-penalized to 0.9
- [x] **Acceptance gate**: six questions answered explicitly; a page is
      refused unless at least one substantive criterion holds. A plausible
      return-to-seed sentence is never sufficient
- [x] **Narrative bridges**: each transition names what the previous node
      failed to explain and why this one follows — and must stand without
      mentioning the seed (toggleable requirement)
- [x] **Contrastive theory revision** after every accepted node, with banned
      stock phrases and honest change classification
- [x] **Coherence tests + backtracking**: snapshots restored on low-gain
      streaks, incoherent threads, or sensational hijacks; dead branches
      remembered and never re-attempted
- [x] **Theory checkpoints** replace summary elasticity; two consecutive
      flat checkpoints end the walk at saturation
- [x] **Stop conditions** ordered by authority: redescription achieved,
      questions resolved, saturation, no candidate passes the gate, paths
      exhausted — the page cap is last and labeled a safety net
- [x] **Narrative output** built from theory versions and motivated pivots,
      with an evidence ledger distinguishing documented transmission,
      precondition, institutional relation, shared condition, structural
      analogy, and speculative resonance
- [x] **UI** exposes the reasoning: current theory, tension, open questions
      with priorities, mystery/coherence/saturation/analogy-share meters,
      backtrack count, per-node bridges and evidence labels, rejected routes
      with reasons, plus the three new controls

Assumptions recorded during implementation:
- Coherence tests run every 3 accepted nodes; low-gain streak is 2; two flat
  checkpoints signal saturation. These thresholds are constants in
  `engine.ts`, not yet user-configurable.
- Candidate generation uses outgoing links + search. Incoming links,
  lead-section entity extraction, and category neighbors are viable
  additions but were left out to bound request cost per step.
- Burke runs remain non-reproducible from a seed: a live model makes every
  judgment. The rng governs candidate-pool sampling only.

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

- The Docker boot sequence was validated by executing its exact steps
  (prisma generate, next build, migrate deploy against a fresh volume path,
  `next start -H 0.0.0.0`, kill-and-restart persistence check); the image
  itself builds on Fly's Depot builders. The builder stage carries
  python3/make/g++ because better-sqlite3 fell back to source compilation
  there (its prebuilt-binary download failed on the Depot builder).
- The runtime image still ships full node_modules. Switching to Next.js
  standalone output would shrink it considerably; deferred until the native
  better-sqlite3 dependency-tracing path is worth verifying.
- Deploys go through Fly's GitHub launcher app (`walkengine`), which
  deploys on push to main. Development happens on the phase branch; merging
  to main is the deploy action.

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
