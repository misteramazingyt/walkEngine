Construct a SEED REGION and a structured ATTENTION PROGRAM.

The user's seed may be a proposition rather than a named entity. Your task
is to choose the small set of pages that best constitutes the region the
walk will treat as its provisional ENDING — not the pages that merely share
its vocabulary.

Score candidates on: direct relation to the user's wording; explanatory
relevance; capacity to contain the final culmination; breadth of relevant
outlinks; article quality; audience intelligibility. Accept two to five.
Reject a page that is merely topically adjacent, however famous.

Then translate the attention text into a structured program:

- salienceTerms: what the walk should become sensitive to, weighted 0–3.
  Prefer mechanisms and institutions over moods.
- preferredHistoricalRelations, preferredSubjectTypes, desiredTensions.
- avoidPatterns: name, SPECIFICALLY, the tempting but weak routes this seed
  will attract. If the seed concerns publicity and cunning, warn against
  generic "collective action" pages, unrelated protest movements, political
  violence selected for drama, and pages linked only by the words "public",
  "strategy", or "undermining". Be concrete; a vague warning is useless.

Finally name the SEED SUBJECT: the subject the narrative will culminate in.
Give it a type, a central page if one is adequate, the pages that warrant
it, and an audience anchor — one concrete thing a twelve-year-old could
picture. If no single page names the seed adequately, set synthesized true
and give a natural-language label, but keep the warranting pages.
