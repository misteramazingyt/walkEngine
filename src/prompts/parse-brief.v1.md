Translate a writer's brief into a walk configuration.

The brief is one paragraph of ordinary speech carrying several different
kinds of instruction at once. Separate them.

**seedText** — the proposition, object, or question the route should culminate
in. Usually the brief's first claim, stated as the writer stated it. Do not
generalise it into a topic: "the meaning of life is exactly what you make it"
is a proposition and "meaning" is not.

**attentionProgram** — the field of salience: what the walk should become
sensitive to as it moves. Everything in the brief about *what to attend to*,
*whose perspective to take*, *what kind of material to prefer*, and *what
rhythm the route should have* belongs here, rewritten as instructions to a
walker rather than as a description of a finished essay. Preserve the
brief's own examples and names — they are the most precise thing in it.

**temporalStart / temporalEnd** — years, negative for BCE. Read the brief's
scale honestly: "over a large time scale" with pre-modern figures implies
antiquity to the present, not a century. Use null where nothing is implied.

**subjectCount** — how many distinct subjects the route should discover,
between 2 and 10. A brief asking for oscillation, breadth, or a long time
scale needs the upper end: there must be enough subjects for a route to
alternate between. Reserve the low end for a brief that asks for depth on
one thing.

**reading** — say, in one or two sentences, what you took the brief to be
asking. The writer should be able to see whether you understood them before
spending anything.

**unhonoured** — every instruction you could NOT express in the fields
above. Be exact and be complete. A brief asking for something the
configuration cannot represent must be told so; silently dropping it and
proceeding produces a walk the writer will believe followed their
instruction. If everything was expressible, return an empty list — but check
before you do.

## What the configuration cannot do

Check the brief against this list before returning an empty `unhonoured`.
The walk cannot:

- alternate or oscillate between kinds of beat on a schedule. It selects each
  next subject by what the current account leaves unexplained, so a request
  to swing between registers — material culture and inwardness, outer and
  inner, concrete and reflective — can bias what it attends to but cannot
  govern the ORDER in which those arrive;
- guarantee that named people or works appear. Names in a brief become
  salience terms, not waypoints. Say so when a brief names figures;
- control tone, register, person, or length of the finished prose;
- prefer or avoid a language, region, or archive beyond its temporal bounds.

State each of these in the writer's own terms when it applies. "Everything
was expressible" is the rarer answer, not the polite default.

---

# Length, density, and what the brief already fixes

**targetWords** — if the brief asks for a length in any form ("essay around
1950 words", "a short piece", "about 3000"), give the number. Null when no
length is implied. Do not invent one from the ambition of the topic.

**namedConnections** — every relationship the brief ALREADY asserts. "meaning
as now only a construct — Wittgenstein and Peirce" is a named connection;
so is "technologies of the self instantiated, not discussed as doctrine".
List them as given. These are not topics to cover: they are the material
left at the scene, and the route is expected to sniff outward from them.

**thesis** — the viewpoint the piece argues, where the brief states one.
Empty where it only gives a direction to look.

**density** — judge how much the brief has already done:

- `dense` — it names several relationships, thinkers, or moves, and largely
  fixes where the piece ends. The work is reduction and enlivening, not
  discovery. The ending should be treated as given.
- `moderate` — it names a direction and one or two relationships. Some of
  the route is fixed; the rest is to be found.
- `sparse` — a seed and a mood. Almost nothing is fixed, the ending least of
  all, and the search must do nearly all the work.

Judge this honestly against what is actually written, not against how
confident the brief sounds. A long brief that repeats one idea is sparse. A
short brief naming four thinkers and their relation is dense.
