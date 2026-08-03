# Connections corpus

Inducing narrative rules for BurkeCluster from the programme it imitates:
James Burke's *Connections* series 1 (BBC, 1978). The engine currently
guesses how many subjects a route needs, how long each should be narrated,
and what makes a transition earned. This pipeline measures those things in a
body of work that demonstrably does them well.

## What is and is not kept

`corpus/` holds third-party material — subtitles, video, and everything
derived that still contains the words — and is gitignored. `findings/` holds
measurements and quotation short enough to identify a passage, and is
committed. Nothing here is redistributed.

## Requirements

- `yt-dlp` (2026.07+), `ffmpeg`, Python 3.11+
- Node, only because yt-dlp needs *some* JavaScript runtime to reach
  subtitle tracks at all; `--js-runtimes node` is passed for you

## Steps

```bash
python fetch.py                     # subtitles for all four episodes
python fetch.py --episode 1 --video 1   # plus video, for scene work
python pilot.py --episode 1         # compare the two segmentations
```

Scene detection is a separate call because it takes minutes per episode:

```python
from pathlib import Path
from scenes import detect_shots, save
cuts = detect_shots(Path("corpus/video/ep01-XetplHcM7aQ.mp4"), 0.12)
save(Path("corpus/scenes/ep01_t12.json"), cuts, 2962.0, 0.12)
```

## What each piece does

| file | role |
| --- | --- |
| `episodes.py` | the four series-1 episodes and their ids |
| `fetch.py` | subtitles (authored preferred over ASR) and low-res video |
| `transcript.py` | json3 → timed cues, flattening authored and ASR formats |
| `scenes.py` | ffmpeg scene scores → shot boundaries and cutting rate |
| `segment.py` | two segmentations: speech pauses, and cutting-rhythm change |
| `pilot.py` | measures the two against each other, and against chance |

## Caption availability, measured

| ep | title | captions |
| --- | --- | --- |
| 1 | The Trigger Effect | authored |
| 2 | Death in the Morning | **none on this upload** |
| 3 | Distant Voices | ASR |
| 4 | Faith in Numbers | ASR |

Episode 2 is excluded until a captioned source or a local transcription
exists. The ASR tracks repeat each line as a rolling prefix of the next,
which `transcript.py` removes; all three surviving episodes then land at
136–141 words per minute, which is the check that the removal was right.

## Why segmentation is not just "split on cuts"

At a detection threshold of 0.12, episode 1 holds 504 shot changes — a cut
every 5.9 seconds. Burke cuts constantly between his face, the object in his
hands, and archive footage while pursuing a single thought, so a cut is not
a paragraph and never was. `segment.py` therefore offers:

- **pause** — break at the longest silences, threshold derived per episode
  because authored and ASR tracks space their cues differently;
- **visual rhythm** — break where the *cutting rate* changes sharply, which
  is what a viewer registers as having moved on.

`pilot.py` reports how often the two agree **and how often they would agree
by chance**, since with a hundred boundaries in fifty minutes a wide window
lands on one whatever the boundaries mean. The lift over chance is the
finding; raw agreement is not.
