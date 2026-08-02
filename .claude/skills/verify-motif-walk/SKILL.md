---
name: verify-motif-walk
description: Verify the Motif Walk repository is healthy - run lint, typecheck, and the full test suite, then check the historical-method invariants in schemas and prompts. Use after completing any implementation phase or substantial change.
---

# Verify Motif Walk

Run these checks in order and report every failure precisely. Do not stop at
the first failure; collect all of them.

## 1. Static checks

```bash
npm run lint
npm run typecheck
```

## 2. Tests

```bash
npm test
```

Tests must not hit live Wikipedia, Wikidata, or LLM endpoints. If a test does,
that is a failure even if it passes.

## 3. Historical-method invariants

Grep-level review, then read the flagged files:

- Every `NarrativeEdge` construction site must set `edgeType`,
  `warrantClass`, `carrier`, `inheritedPressure`, `transformedPressure`,
  and `confidence`.
- No prompt or fixture may phrase a `FUNCTIONAL_ANALOGY`,
  `RHETORICAL_RECURRENCE`, `SYMBOLIC_MOTIF`, or `SPECULATIVE_ASSOCIATION`
  edge in causal language ("led to", "caused", "influenced").
- No code path may build a narrative edge from a raw hyperlink without an
  orchestration/verification stage between them.
- User-edited draft segments (`userEdited: true`) must never be overwritten
  outside an explicit confirmation flow.

## 4. Determinism

Seeded walk code must not reference `Math.random` (`grep -rn "Math.random" src/`
should return nothing outside tests of the guard itself).

## Report

Summarize: passing checks, failing checks with file:line, and any invariant
violations with a one-line fix recommendation each.
