"""Cutting a transcript into paragraphs, two ways, so they can be compared.

PAUSE segmentation breaks where Burke stops speaking for longer than usual.
It needs no video and is available for every episode.

VISUAL segmentation breaks where the CUTTING RHYTHM changes, not where a cut
occurs. A shot boundary is far too frequent to be a paragraph — a fifty
minute episode holds hundreds — so what we look for is the boundary between
a passage cut one way and a passage cut another: the long take that follows
a montage, the burst that follows a piece to camera. Those are the moments a
viewer registers as "we have moved on".

Both emit the same structure, so the categorizer downstream cannot tell
which produced its input, and the pilot can put them side by side.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from pathlib import Path

from transcript import Cue, load_cues


@dataclass
class Paragraph:
    index: int
    start_s: float
    end_s: float
    text: str
    cue_count: int
    boundary_reason: str = ""
    cuts_within: int = 0

    @property
    def duration_s(self) -> float:
        return self.end_s - self.start_s

    @property
    def word_count(self) -> int:
        return len(self.text.split())

    def to_dict(self) -> dict:
        return {
            "index": self.index,
            "start_s": round(self.start_s, 2),
            "end_s": round(self.end_s, 2),
            "duration_s": round(self.duration_s, 2),
            "word_count": self.word_count,
            "cue_count": self.cue_count,
            "cuts_within": self.cuts_within,
            "boundary_reason": self.boundary_reason,
            "text": self.text,
        }


@dataclass
class Segmentation:
    method: str
    paragraphs: list[Paragraph] = field(default_factory=list)

    def stats(self) -> dict:
        if not self.paragraphs:
            return {}
        words = [p.word_count for p in self.paragraphs]
        durs = [p.duration_s for p in self.paragraphs]
        return {
            "method": self.method,
            "paragraphs": len(self.paragraphs),
            "median_words": round(statistics.median(words), 1),
            "mean_words": round(statistics.mean(words), 1),
            "min_words": min(words),
            "max_words": max(words),
            "median_seconds": round(statistics.median(durs), 1),
            "mean_seconds": round(statistics.mean(durs), 1),
        }


def _build(
    cues: list[Cue],
    break_before: set[int],
    reasons: dict[int, str],
    method: str,
    cuts: list[float] | None = None,
) -> Segmentation:
    seg = Segmentation(method=method)
    current: list[Cue] = []
    reason = "start"
    for i, cue in enumerate(cues):
        if i in break_before and current:
            seg.paragraphs.append(_finish(seg, current, reason, cuts))
            reason = reasons.get(i, "")
            current = []
        current.append(cue)
    if current:
        seg.paragraphs.append(_finish(seg, current, reason, cuts))
    return seg


def _finish(
    seg: Segmentation, cues: list[Cue], reason: str, cuts: list[float] | None
) -> Paragraph:
    start = cues[0].start_ms / 1000
    end = cues[-1].end_ms / 1000
    within = sum(1 for c in cuts if start <= c < end) if cuts else 0
    return Paragraph(
        index=len(seg.paragraphs) + 1,
        start_s=start,
        end_s=end,
        text=" ".join(c.text for c in cues),
        cue_count=len(cues),
        boundary_reason=reason,
        cuts_within=within,
    )


def by_pause(
    cues: list[Cue], min_words: int = 40, pause_percentile: float = 0.85
) -> Segmentation:
    """Break at the longest silences, subject to a minimum paragraph length.

    The pause threshold is derived per-episode rather than fixed: an authored
    subtitle track and an ASR track space their cues quite differently, and a
    constant in milliseconds would segment one sensibly and the other absurdly.
    """
    gaps = [
        max(0, cues[i + 1].start_ms - cues[i].end_ms) for i in range(len(cues) - 1)
    ]
    if not gaps:
        return Segmentation("pause")
    ordered = sorted(gaps)
    threshold = ordered[min(len(ordered) - 1, int(len(ordered) * pause_percentile))]
    threshold = max(threshold, 400)

    breaks: set[int] = set()
    reasons: dict[int, str] = {}
    words_since = 0
    for i, cue in enumerate(cues):
        words_since += len(cue.text.split())
        if i < len(gaps) and gaps[i] >= threshold and words_since >= min_words:
            breaks.add(i + 1)
            reasons[i + 1] = f"pause {gaps[i]}ms"
            words_since = 0
    return _build(cues, breaks, reasons, "pause")


def by_visual_rhythm(
    cues: list[Cue],
    cuts: list[float],
    window_s: float = 20.0,
    min_words: int = 40,
    sensitivity: float = 1.6,
) -> Segmentation:
    """Break where the cutting rate changes sharply, not at every cut.

    For each candidate boundary we compare the cut rate in the window before
    it against the window after. A ratio far from 1 in either direction means
    the programme changed how it is showing things, which is the visual
    signal a paragraph break should track.
    """
    if not cuts:
        return Segmentation("visual")

    def rate(lo: float, hi: float) -> float:
        n = sum(1 for c in cuts if lo <= c < hi)
        return n / max(1e-6, (hi - lo)) * 60.0

    breaks: set[int] = set()
    reasons: dict[int, str] = {}
    words_since = 0
    for i, cue in enumerate(cues):
        words_since += len(cue.text.split())
        if words_since < min_words:
            continue
        t = cue.start_ms / 1000
        before = rate(max(0.0, t - window_s), t)
        after = rate(t, t + window_s)
        # Guard the zero cases: silence-to-montage and montage-to-long-take.
        if before < 0.5 and after < 0.5:
            continue
        ratio = (after + 0.5) / (before + 0.5)
        if ratio >= sensitivity or ratio <= 1 / sensitivity:
            breaks.add(i)
            reasons[i] = (
                f"cut rate {before:.1f}→{after:.1f}/min"
                if before or after
                else "rhythm change"
            )
            words_since = 0
    return _build(cues, breaks, reasons, "visual", cuts)


def load_segmentation(
    transcript: Path, cuts: list[float] | None, method: str
) -> Segmentation:
    cues = load_cues(transcript)
    if method == "pause":
        return by_pause(cues)
    if method == "visual":
        if not cuts:
            raise SystemExit("Visual segmentation needs scene data for this episode")
        return by_visual_rhythm(cues, cuts)
    raise SystemExit(f"Unknown method {method!r}")
