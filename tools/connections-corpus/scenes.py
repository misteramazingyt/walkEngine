"""Shot boundaries from the video, via ffmpeg's scene-change score.

ffmpeg emits, per frame, a `scene` score in [0,1] measuring how much the
frame differs from its predecessor. A cut scores high; a pan or a dissolve
scores moderately over several frames.

What matters for our purpose is that a television shot is NOT a paragraph.
Burke cuts every few seconds — between his face, the object he is holding,
and archive footage — while still pursuing one thought. So we take shot
boundaries as raw material and look for the sparse points where the cutting
pattern itself changes: a long take after rapid cutting, or a burst of cuts
after a long take, is a change of scene in the sense a writer would mean.
"""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Shot:
    start_s: float
    end_s: float

    @property
    def length_s(self) -> float:
        return self.end_s - self.start_s


SHOWINFO = re.compile(r"pts_time:(\d+\.?\d*)")


def detect_shots(video: Path, threshold: float = 0.30) -> list[float]:
    """Timestamps (seconds) where a shot change is detected."""
    result = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-i",
            str(video),
            "-filter_complex",
            f"select='gt(scene,{threshold})',showinfo",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
    )
    # showinfo writes to stderr by design; a non-zero code is the real failure.
    if result.returncode != 0:
        raise SystemExit(result.stderr[-2000:])
    return [float(m) for m in SHOWINFO.findall(result.stderr)]


def shots_from_cuts(cuts: list[float], duration_s: float) -> list[Shot]:
    marks = [0.0, *cuts, duration_s]
    return [Shot(a, b) for a, b in zip(marks, marks[1:]) if b > a]


def cut_rate_series(cuts: list[float], duration_s: float, window_s: float = 30.0):
    """Cuts per minute in a sliding window — the rhythm, not the cuts."""
    steps = int(duration_s // window_s) + 1
    series = []
    for i in range(steps):
        lo, hi = i * window_s, (i + 1) * window_s
        n = sum(1 for c in cuts if lo <= c < hi)
        series.append({"start_s": lo, "cuts": n, "per_min": n * (60.0 / window_s)})
    return series


def save(path: Path, cuts: list[float], duration_s: float, threshold: float) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    shots = shots_from_cuts(cuts, duration_s)
    lengths = sorted(s.length_s for s in shots)
    median = lengths[len(lengths) // 2] if lengths else 0.0
    path.write_text(
        json.dumps(
            {
                "threshold": threshold,
                "duration_s": duration_s,
                "cut_count": len(cuts),
                "median_shot_s": round(median, 2),
                "mean_shot_s": round(duration_s / max(1, len(shots)), 2),
                "cuts": [round(c, 3) for c in cuts],
                "cut_rate_30s": cut_rate_series(cuts, duration_s),
            },
            indent=1,
        ),
        encoding="utf8",
    )
