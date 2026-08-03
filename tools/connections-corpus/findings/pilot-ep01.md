# Pilot — Connections ep01, “The Trigger Effect”

Two ways of cutting the same transcript into paragraphs, measured against
each other. Full paragraph text stays in the gitignored corpus; what
follows is measurement plus a handle of a dozen words per paragraph.

## The transcript

- 472 cues, 6417 words over 47.1 min
- 136.4 words per minute
- 504 shot changes detected (threshold 0.12), mean shot 5.9s

A shot every few seconds is why cuts alone cannot mark paragraphs: there
are an order of magnitude more of them than there are thoughts.

## The two segmentations

| | pause | visual rhythm |
| --- | --- | --- |
| paragraphs | 52 | 109 |
| median words | 99.5 | 51 |
| mean words | 123.4 | 58.9 |
| shortest (words) | 41 | 21 |
| longest (words) | 395 | 200 |
| median seconds | 38.2 | 20.1 |
| mean seconds | 46.3 | 23.5 |

## Do they agree on where a paragraph ends?

| window | pause boundaries near a visual one | same, if visual were random | lift |
| --- | --- | --- | --- |
| ±5s | 52.9% | 30.0% | +23.0 pts |
| ±10s | 72.5% | 51.4% | +21.1 pts |
| ±20s | 90.2% | 76.3% | +13.9 pts |

Lift is the whole finding: agreement above what scattering the same
number of boundaries at random would produce.

## First 12 paragraphs — pause

| # | start | s | words | cuts | boundary | opening words |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0:49 | 23 | 65 | 0 | start | Would you do me a favor I'd like to stop talking for ... |
| 2 | 1:21 | 70 | 191 | 0 | pause 8820ms | Well, that is what this series is going to be all about ... |
| 3 | 2:39 | 31 | 100 | 0 | pause 7991ms | The story of the events and the people who over centuries Came ... |
| 4 | 3:46 | 53 | 177 | 0 | pause 37061ms | Take going up in the world like that for granted we all ... |
| 5 | 4:44 | 32 | 95 | 0 | pause 4749ms | New York City like all the other major high-density population centers scattered ... |
| 6 | 5:19 | 46 | 141 | 0 | pause 3280ms | I'd like you to meet a few people who were in or ... |
| 7 | 6:08 | 36 | 75 | 0 | pause 3081ms | 800,000 people crowd onto subways looking forward to home to the end ... |
| 8 | 6:47 | 29 | 89 | 0 | pause 3180ms | Three minutes past 5:00 at the energy Control Center downtown nothing special ... |
| 9 | 7:22 | 32 | 68 | 0 | pause 5530ms | Ten past five Mount Sinai Hospital The patient mrs. Makana is expecting ... |
| 10 | 7:57 | 44 | 102 | 0 | pause 3540ms | The way stand means worship we made it In the subway Herbert ... |
| 11 | 8:45 | 18 | 41 | 0 | pause 3760ms | 5:15 at Kennedy Airport at one of the international terminals on the ... |
| 12 | 9:09 | 20 | 44 | 0 | pause 5260ms | Part Deerpark 1 to 2 on radio vector final runway 4, right ... |

## First 12 paragraphs — visual

| # | start | s | words | cuts | boundary | opening words |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0:49 | 10 | 37 | 0 | start | Would you do me a favor I'd like to stop talking for ... |
| 2 | 1:00 | 24 | 40 | 0 | cut rate 3.0→0.0/min | Surround you the television set the lights the phone and so on ... |
| 3 | 1:25 | 21 | 62 | 2 | cut rate 0.0→6.0/min | it's about the things that surround you in the modern world and ... |
| 4 | 1:46 | 17 | 44 | 0 | cut rate 6.0→0.0/min | because it's in those strange places and in those long-gone centuries that ... |
| 5 | 2:03 | 27 | 73 | 1 | cut rate 0.0→3.0/min | doctor the court of Queen Elizabeth did something that made it possible ... |
| 6 | 2:39 | 13 | 49 | 2 | cut rate 0.0→6.0/min | The story of the events and the people who over centuries Came ... |
| 7 | 2:53 | 17 | 51 | 1 | cut rate 6.0→15.0/min | It's become a a life support system without which we can't survive ... |
| 8 | 3:46 | 12 | 44 | 0 | cut rate 51.0→0.0/min | Take going up in the world like that for granted we all ... |
| 9 | 3:59 | 41 | 133 | 0 | cut rate 9.0→0.0/min | the things around us the manmade inventions, we provide ourselves with I ... |
| 10 | 4:44 | 18 | 50 | 1 | cut rate 0.0→6.0/min | New York City like all the other major high-density population centers scattered ... |
| 11 | 5:03 | 13 | 45 | 14 | cut rate 3.0→54.0/min | And yet in cities everywhere we act as if that were not ... |
| 12 | 5:19 | 13 | 51 | 0 | cut rate 57.0→0.0/min | I'd like you to meet a few people who were in or ... |
