"""Does pause segmentation carry the information the visuals would give?

    python boundary_information.py --episode 1

The pilot measured co-occurrence: how often the two methods break at the
same moment. That is a weaker claim than the one we need. Dropping video
entirely is only safe if the pauses are standing in for the visual signal —
if, where Burke stops speaking, the programme also changes how it is showing
things — and if the boundaries the visual method finds ALONE are mostly
artefacts rather than structure the pauses are blind to.

So three questions, each with a null to beat:

  1. Do pause boundaries sit at sharper rhythm changes than arbitrary
     moments in the same episode?
  2. Of the sharpest rhythm changes in the episode, how many does pause
     segmentation catch?
  3. The boundaries visual finds and pause does not — are they near-misses
     at the pause threshold, or are they somewhere pause could never see?

Question 3 decides the matter. A near-miss means one threshold controls
both, and video adds nothing but precision. Structure invisible to speech
means video is carrying information of its own.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import statistics
from pathlib import Path

from episodes import CONNECTIONS_1
from segment import by_pause, by_visual_rhythm
from transcript import load_cues

ROOT = Path(__file__).parent
WINDOW_S = 20.0


def rhythm_change(cuts: list[float], t: float, window_s: float = WINDOW_S) -> float:
    """|log ratio| of cutting rate after t versus before — 0 means no change."""
    before = sum(1 for c in cuts if max(0.0, t - window_s) <= c < t)
    after = sum(1 for c in cuts if t <= c < t + window_s)
    return abs(math.log((after + 0.5) / (before + 0.5)))


def gap_near(gaps: list[tuple[float, int]], t: float, tol: float = 6.0) -> int:
    """The longest inter-cue silence within tol seconds of t, in ms."""
    nearby = [ms for (when, ms) in gaps if abs(when - t) <= tol]
    return max(nearby) if nearby else 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--episode", type=int, default=1)
    args = parser.parse_args()

    ep = next(e for e in CONNECTIONS_1 if e.number == args.episode)
    cues = load_cues(
        ROOT / "corpus" / "transcripts" / f"ep{ep.number:02d}-{ep.video_id}.en.json3"
    )
    scenes = json.loads(
        (ROOT / "corpus" / "scenes" / f"ep{ep.number:02d}_t12.json").read_text("utf8")
    )
    cuts: list[float] = scenes["cuts"]
    duration: float = scenes["duration_s"]

    pause = by_pause(cues)
    visual = by_visual_rhythm(cues, cuts)
    pause_marks = [p.start_s for p in pause.paragraphs[1:]]
    visual_marks = [p.start_s for p in visual.paragraphs[1:]]

    # Every inter-cue silence, with when it happened — the raw material the
    # pause method thresholds, needed to ask whether a missed boundary was a
    # near-miss or invisible.
    gaps = [
        ((cues[i].end_ms / 1000), max(0, cues[i + 1].start_ms - cues[i].end_ms))
        for i in range(len(cues) - 1)
    ]
    gap_values = sorted(ms for _, ms in gaps)
    threshold_ms = gap_values[int(len(gap_values) * 0.85)]

    rng = random.Random(20260803)
    print(f"=== ep{ep.number:02d} {ep.title} ===")
    print(f"pause boundaries {len(pause_marks)}, visual boundaries {len(visual_marks)}")
    print(f"pause threshold: {threshold_ms} ms\n")

    # --- 1. Are pause boundaries at sharper rhythm changes than chance? ---
    at_pause = [rhythm_change(cuts, t) for t in pause_marks]
    trials = 500
    null_means = []
    for _ in range(trials):
        sample = [rng.uniform(0, duration) for _ in pause_marks]
        null_means.append(statistics.mean(rhythm_change(cuts, t) for t in sample))
    observed = statistics.mean(at_pause)
    null_mean = statistics.mean(null_means)
    beaten = sum(1 for m in null_means if m >= observed)
    print("1. rhythm change at pause boundaries vs arbitrary moments")
    print(f"   observed mean |log rate ratio| : {observed:.3f}")
    print(f"   null (random moments)          : {null_mean:.3f}")
    print(f"   permutation p                  : {(beaten + 1) / (trials + 1):.4f}")
    print(f"   ratio                          : {observed / max(1e-9, null_mean):.2f}x\n")

    # --- 2. Of the sharpest rhythm changes, how many does pause catch? ---
    candidates = [t for t in range(0, int(duration), 5)]
    scored = sorted(candidates, key=lambda t: rhythm_change(cuts, float(t)), reverse=True)
    top = scored[: len(pause_marks)]
    caught = sum(1 for t in top if any(abs(t - p) <= 10 for p in pause_marks))
    null_caught = statistics.mean(
        sum(
            1
            for t in rng.sample(candidates, len(top))
            if any(abs(t - p) <= 10 for p in pause_marks)
        )
        for _ in range(trials)
    )
    print("2. sharpest rhythm changes caught by pause segmentation")
    print(f"   caught {caught}/{len(top)} = {100 * caught / len(top):.1f}%")
    print(f"   null   {null_caught:.1f}/{len(top)} = {100 * null_caught / len(top):.1f}%\n")

    # --- 3. What are the visual-only boundaries made of? ---
    visual_only = [t for t in visual_marks if not any(abs(t - p) <= 10 for p in pause_marks)]
    near_miss = 0
    silent = 0
    for t in visual_only:
        g = gap_near(gaps, t)
        if g >= threshold_ms * 0.5:
            near_miss += 1
        elif g < 300:
            silent += 1
    print("3. boundaries the visuals find and the pauses do not")
    print(f"   visual-only boundaries : {len(visual_only)}")
    print(
        f"   near-miss (a real pause, at least half threshold) : {near_miss} "
        f"({100 * near_miss / max(1, len(visual_only)):.0f}%)"
    )
    print(
        f"   no meaningful pause at all (< 300ms)              : {silent} "
        f"({100 * silent / max(1, len(visual_only)):.0f}%)"
    )
    print(
        "\n   A near-miss is reachable by lowering one threshold; a boundary with"
        "\n   no pause at all is structure speech timing cannot see."
    )


if __name__ == "__main__":
    main()
