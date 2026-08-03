# Subjects as trajectories, from model-extracted mentions

Every mention of every subject in Connections series 1, extracted
paragraph by paragraph with a running registry so that reference
accumulates rather than being re-guessed. Near-duplicate registrations
are merged only on identical labels, so no coreference is asserted
here that the extractor did not.

**Lead** is now the distance from a subject's first mention to the
paragraph where it becomes the topic — the quantity BurkeCluster's
incipit gate assumes and never measures.

| episode | paragraphs | recurring subjects | ever topic | median lead | arrive before topic | first mention not topical | median topic paragraphs | median live at once |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ep01 The Trigger Effect | 52 | 40 | 34 | 0.0 | 32.4% | 11.8% | 2.0 | 13.0 |
| ep03 Distant Voices | 43 | 36 | 17 | 1 | 52.9% | 5.9% | 2 | 11 |
| ep04 Faith in Numbers | 41 | 42 | 26 | 0.0 | 30.8% | 7.7% | 2.0 | 16 |

## How subjects are mentioned

| mention type | all mentions | as a subject's FIRST mention |
| --- | --- | --- |
| definite_description | 1029 (39.9%) | 281 (22.0%) |
| indefinite_introduction | 856 (33.2%) | 759 (59.5%) |
| named | 511 (19.8%) | 221 (17.3%) |
| pronoun | 166 (6.4%) | 13 (1.0%) |
| metonym | 13 (0.5%) | 1 (0.1%) |
| allusion | 1 (0.0%) | 0 (0.0%) |

## What mentions are doing

| role | count | share |
| --- | --- | --- |
| supporting | 1809 | 70.2% |
| elaborated | 479 | 18.6% |
| topic | 237 | 9.2% |
| passing | 26 | 1.0% |
| planted | 25 | 1.0% |

## ep01 — the 15 most-mentioned recurring subjects

| subject | kind | mentions | first | first topic | lead | last | span | introduced as |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hypothetical survivor | person | 31 | 30 | 30 | 0 | 32 | 3 | pronoun/topic |
| New York City | place | 22 | 4 | 5 | 1 | 50 | 47 | definite_description/planted |
| plow | artifact | 22 | 32 | 32 | 0 | 50 | 19 | definite_description/supporting |
| all these people | group | 20 | 10 | 10 | 0 | 29 | 20 | definite_description/topic |
| people | group | 15 | 32 | 34 | 2 | 51 | 20 | indefinite_introduction/supporting |
| subways | artifact | 14 | 7 | 7 | 0 | 29 | 23 | named/supporting |
| Mrs. Makana | person | 14 | 9 | 9 | 0 | 28 | 20 | named/elaborated |
| electricity | concept | 13 | 14 | 14 | 0 | 32 | 19 | indefinite_introduction/elaborated |
| unknown event/thing causing vulnerability | event | 12 | 6 | 21 | 15 | 23 | 18 | pronoun/planted |
| Nile River | place | 10 | 34 | 34 | 0 | 45 | 12 | definite_description/topic |
| modern technology | concept | 9 | 3 | 3 | 0 | 52 | 50 | named/topic |
| technological network | concept | 9 | 14 | 14 | 0 | 50 | 37 | pronoun/planted |
| farm | place | 9 | 30 | None | None | 32 | 3 | indefinite_introduction/supporting |
| Pharaoh | person | 9 | 38 | 38 | 0 | 49 | 12 | definite_description/elaborated |
| Scandinavian Airlines 911 | artifact | 8 | 11 | 11 | 0 | 25 | 15 | named/elaborated |

## ep03 — the 15 most-mentioned recurring subjects

| subject | kind | mentions | first | first topic | lead | last | span | introduced as |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| horse | artifact | 19 | 4 | 10 | 6 | 16 | 13 | definite_description/supporting |
| People | group | 12 | 32 | None | None | 43 | 12 | indefinite_introduction/supporting |
| heavy plow | artifact | 11 | 13 | 13 | 0 | 17 | 5 | indefinite_introduction/elaborated |
| gunpowder | artifact | 11 | 20 | 20 | 0 | 41 | 22 | indefinite_introduction/topic |
| the Chinese | group | 11 | 22 | 23 | 1 | 26 | 5 | pronoun/supporting |
| Henry V | person | 10 | 11 | 12 | 1 | 13 | 3 | named/supporting |
| Welsh Longbow | artifact | 10 | 12 | 12 | 0 | 19 | 8 | definite_description/elaborated |
| Water | concept | 10 | 26 | 26 | 0 | 40 | 15 | indefinite_introduction/elaborated |
| glass tube | artifact | 10 | 33 | None | None | 36 | 4 | indefinite_introduction/supporting |
| electricity | concept | 9 | 1 | 36 | 35 | 42 | 42 | indefinite_introduction/supporting |
| knight | person | 8 | 6 | 10 | 4 | 13 | 8 | indefinite_introduction/supporting |
| money | concept | 8 | 6 | None | None | 30 | 25 | named/supporting |
| the English | group | 8 | 12 | None | None | 24 | 13 | named/supporting |
| Yakimoff | place | 7 | 28 | 28 | 0 | 30 | 3 | named/topic |
| Mercury | artifact | 7 | 31 | 34 | 3 | 34 | 4 | indefinite_introduction/supporting |

## ep04 — the 15 most-mentioned recurring subjects

| subject | kind | mentions | first | first topic | lead | last | span | introduced as |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| book | artifact | 14 | 23 | 23 | 0 | 28 | 6 | definite_description/elaborated |
| Europe | place | 13 | 4 | None | None | 35 | 32 | named/supporting |
| separate car card | artifact | 13 | 35 | 35 | 0 | 40 | 6 | indefinite_introduction/elaborated |
| people | group | 12 | 13 | None | None | 40 | 28 | pronoun/supporting |
| paper | artifact | 12 | 18 | 19 | 1 | 40 | 23 | indefinite_introduction/planted |
| black death | event | 9 | 15 | 15 | 0 | 21 | 7 | named/elaborated |
| cylinder with pegs | artifact | 9 | 29 | 29 | 0 | 40 | 12 | indefinite_introduction/elaborated |
| linen | artifact | 8 | 17 | 17 | 0 | 40 | 24 | indefinite_introduction/elaborated |
| holes | artifact | 8 | 34 | 34 | 0 | 38 | 5 | indefinite_introduction/elaborated |
| tabulator | artifact | 8 | 36 | 38 | 2 | 40 | 5 | definite_description/planted |
| prince | person | 7 | 23 | 28 | 5 | 32 | 10 | definite_description/supporting |
| water power | concept | 6 | 3 | 3 | 0 | 35 | 33 | indefinite_introduction/topic |
| new loom | artifact | 6 | 8 | 8 | 0 | 20 | 13 | definite_description/supporting |
| the champagne fairs | event | 6 | 11 | 11 | 0 | 14 | 4 | definite_description/topic |
| press | artifact | 6 | 20 | None | None | 39 | 20 | indefinite_introduction/supporting |
