"""Reading json3 caption files into a uniform stream of timed cues.

Two shapes arrive under the same extension. An authored track carries one
`utf8` segment per cue, already punctuated and cased by a person. An ASR
track carries one segment per WORD, each with its own offset inside the cue,
unpunctuated and lowercase, and repeats the previous cue's text as a rolling
"karaoke" line. Both reduce to the same thing: text with a start and an end.

Nothing here decides where paragraphs go. It only makes the two formats
indistinguishable to the code that does.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Cue:
    start_ms: int
    end_ms: int
    text: str

    @property
    def duration_ms(self) -> int:
        return self.end_ms - self.start_ms


def _clean(text: str) -> str:
    # Caption sources mark non-speech and speaker changes; neither is prose.
    text = re.sub(r"\[[^\]]*\]", " ", text)
    text = re.sub(r"^\s*[-–]\s*", "", text)
    return re.sub(r"\s+", " ", text).strip()


def load_cues(path: Path) -> list[Cue]:
    data = json.loads(path.read_text(encoding="utf8"))
    cues: list[Cue] = []
    for event in data.get("events") or []:
        segs = event.get("segs")
        if not segs:
            continue
        start = event.get("tStartMs")
        if start is None:
            continue
        text = _clean("".join(s.get("utf8", "") for s in segs))
        if not text:
            continue
        duration = event.get("dDurationMs") or 0
        cues.append(Cue(int(start), int(start) + int(duration), text))

    cues.sort(key=lambda c: c.start_ms)
    return _drop_rolling_duplicates(cues)


def _drop_rolling_duplicates(cues: list[Cue]) -> list[Cue]:
    """ASR tracks re-emit the previous line as a prefix of the next cue.

    Left in place, every phrase would be counted two or three times and the
    measured length of a narration would be meaningless. A cue whose text is
    contained in its predecessor's is the same speech, redisplayed.
    """
    kept: list[Cue] = []
    for cue in cues:
        if kept and cue.text and cue.text in kept[-1].text:
            continue
        if kept and kept[-1].text and kept[-1].text in cue.text:
            kept[-1] = Cue(kept[-1].start_ms, cue.end_ms, cue.text)
            continue
        kept.append(cue)
    return kept


def transcript_stats(cues: list[Cue]) -> dict[str, float]:
    if not cues:
        return {"cues": 0, "words": 0, "span_s": 0.0, "words_per_minute": 0.0}
    words = sum(len(c.text.split()) for c in cues)
    span_s = (cues[-1].end_ms - cues[0].start_ms) / 1000
    return {
        "cues": len(cues),
        "words": words,
        "span_s": round(span_s, 1),
        "words_per_minute": round(words / (span_s / 60), 1) if span_s else 0.0,
    }
