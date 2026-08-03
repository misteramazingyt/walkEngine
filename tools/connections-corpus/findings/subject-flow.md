# How subjects move through paragraphs

Measured over pause-segmented Connections series 1. No model involved:
these are counts of where terms appear across paragraph indices.

> **These numbers are not yet usable.** The unit of analysis is a
> normalized unigram against a hand-written stoplist, and the densest
> "subjects" it reports for episode 1 include *enough*, *you've*,
> *hey*, and *far* alongside *plow*, *farm*, and *train*. The
> trajectory measurements below are therefore computed over a
> population that is part subject and part leaked function word, and
> the medians inherit that contamination. What the table establishes
> is that the shape is measurable, not what its values are. Proper
> mention extraction — noun phrases and named entities, not bag of
> words — has to come first.

A *recurring subject* here is any term appearing in at least
3 paragraphs. Its **lead** is the distance from its first
mention to the paragraph where it is densest — how far ahead of itself
the programme plants a thing before making it the topic. Its **span** is
first to last mention, and it **returns** if it comes back after an
absence of two or more paragraphs.

| episode | paragraphs | located subjects | ambient terms | median lead | planted early | median span | median tail | returns | median live at once |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ep01 The Trigger Effect | 52 | 25 | 118 | 5 | 76.0% | 20 | 6 | 84.0% | 13.0 |
| ep03 Distant Voices | 43 | 37 | 94 | 2 | 81.1% | 11 | 2 | 59.5% | 14 |
| ep04 Faith in Numbers | 41 | 36 | 103 | 2.5 | 69.4% | 16.0 | 5.0 | 91.7% | 17 |

## ep01 — the 15 densest subjects

| term | mentions | paragraphs | first | peak | last | lead | tail | returns |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| plow | 14 | 5 | 32 | 32 | 50 | 0 | 18 | 3 |
| enough | 11 | 6 | 8 | 30 | 47 | 22 | 17 | 3 |
| you've | 10 | 7 | 4 | 31 | 47 | 27 | 16 | 4 |
| second | 9 | 5 | 6 | 14 | 25 | 8 | 11 | 2 |
| century | 7 | 5 | 2 | 2 | 46 | 0 | 44 | 2 |
| far | 7 | 4 | 12 | 30 | 40 | 18 | 10 | 2 |
| farm | 7 | 3 | 30 | 31 | 32 | 1 | 1 | 0 |
| survive | 5 | 4 | 3 | 32 | 50 | 29 | 18 | 2 |
| ability | 5 | 3 | 4 | 44 | 50 | 40 | 6 | 2 |
| die | 5 | 4 | 5 | 31 | 33 | 26 | 2 | 2 |
| hey | 5 | 3 | 10 | 49 | 50 | 39 | 1 | 1 |
| later | 5 | 4 | 14 | 29 | 44 | 15 | 15 | 2 |
| thought | 5 | 4 | 17 | 28 | 29 | 11 | 1 | 2 |
| triggered | 5 | 4 | 17 | 32 | 48 | 15 | 16 | 2 |
| train | 5 | 3 | 23 | 27 | 29 | 4 | 2 | 1 |

## ep03 — the 15 densest subjects

| term | mentions | paragraphs | first | peak | last | lead | tail | returns |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| water | 16 | 6 | 21 | 31 | 40 | 10 | 9 | 4 |
| chinese | 11 | 4 | 22 | 26 | 26 | 4 | 0 | 0 |
| electricity | 10 | 6 | 1 | 40 | 42 | 39 | 2 | 1 |
| french | 10 | 7 | 11 | 13 | 38 | 2 | 25 | 3 |
| plow | 10 | 4 | 13 | 14 | 17 | 1 | 3 | 0 |
| tube | 10 | 4 | 31 | 33 | 36 | 2 | 3 | 0 |
| place | 9 | 6 | 10 | 28 | 34 | 18 | 6 | 3 |
| henry | 9 | 3 | 11 | 12 | 13 | 1 | 1 | 0 |
| metal | 8 | 3 | 30 | 40 | 41 | 10 | 1 | 1 |
| universe | 7 | 4 | 1 | 26 | 41 | 25 | 15 | 2 |
| gunpowder | 7 | 6 | 20 | 22 | 41 | 2 | 19 | 1 |
| mercury | 7 | 3 | 31 | 33 | 34 | 2 | 1 | 0 |
| glass | 7 | 4 | 33 | 33 | 41 | 0 | 8 | 1 |
| half | 6 | 5 | 2 | 4 | 12 | 2 | 8 | 2 |
| weapon | 6 | 4 | 4 | 13 | 20 | 9 | 7 | 2 |

## ep04 — the 15 densest subjects

| term | mentions | paragraphs | first | peak | last | lead | tail | returns |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| linen | 14 | 6 | 17 | 18 | 40 | 1 | 22 | 1 |
| thread | 11 | 3 | 8 | 32 | 34 | 24 | 2 | 1 |
| printing | 11 | 5 | 21 | 22 | 40 | 1 | 18 | 2 |
| system | 10 | 5 | 1 | 3 | 28 | 2 | 25 | 2 |
| wheel | 10 | 3 | 3 | 3 | 40 | 0 | 37 | 2 |
| greek | 10 | 4 | 25 | 28 | 28 | 3 | 0 | 0 |
| prince | 8 | 6 | 23 | 28 | 32 | 5 | 4 | 1 |
| cylinder | 8 | 5 | 29 | 35 | 40 | 6 | 5 | 1 |
| needle | 8 | 3 | 33 | 34 | 38 | 1 | 4 | 1 |
| organ | 7 | 4 | 3 | 33 | 40 | 30 | 7 | 2 |
| fall | 6 | 3 | 1 | 1 | 40 | 0 | 39 | 1 |
| town | 6 | 5 | 2 | 12 | 15 | 10 | 3 | 1 |
| roman | 6 | 3 | 3 | 3 | 28 | 0 | 25 | 1 |
| mill | 6 | 5 | 3 | 3 | 33 | 0 | 30 | 2 |
| yourself | 6 | 4 | 3 | 3 | 19 | 0 | 16 | 2 |
