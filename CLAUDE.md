# MOTIF WALK development rules

## Product invariant

This application distinguishes graph adjacency from historical warrant.
Never treat a Wikipedia hyperlink as evidence of causation, influence,
reception, or functional equivalence.

## Architecture

- TypeScript strict mode.
- Domain logic must not import UI components.
- External API responses must be converted into internal domain types.
- All LLM outputs must use Zod-validated structured output.
- Persist intermediate products before starting the next generation stage.
- Do not overwrite user-edited draft segments.

## Historical-method invariant

Every narrative edge requires:

- edge type;
- warrant class;
- carrier;
- inherited pressure;
- transformed pressure;
- confidence;
- evidence or explicit statement that evidence is missing.

Analogy must never be phrased as documented influence.

## UX invariant

The graph and Draft 0 are synchronized views of the same narrative model.
Selections in either view must highlight the corresponding material in
the other.

## Testing

Write unit tests for:

- deterministic seeded random walks;
- criteriological scoring;
- path repetition penalties;
- Zod parsing;
- edge warrant downgrading;
- preservation of user-edited segments;
- export/import round trips.

Use mocked Wikipedia, Wikidata, and LLM responses in automated tests.

## Commands

- `npm run dev` — dev server
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — Vitest
- `npx prisma migrate dev` — apply schema changes locally
