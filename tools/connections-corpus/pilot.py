"""Compare pause segmentation against visual segmentation on one episode.

    python pilot.py --episode 1

Writes two things, deliberately separated:

  corpus/segments/*.json   full paragraph text — gitignored, third-party
  findings/pilot-epNN.md   measurements and short excerpts — committed

The split is not bookkeeping. The transcripts belong to their makers; what
we are entitled to keep and publish is what we measured about their shape,
plus quotation short enough to show the reader which passage is meant.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from episodes import CONNECTIONS_1
from segment import Segmentation, by_pause, by_visual_rhythm
from transcript import load_cues, transcript_stats

ROOT = Path(__file__).parent
TRANSCRIPTS = ROOT / "corpus" / "transcripts"
SCENES = ROOT / "corpus" / "scenes"
SEGMENTS = ROOT / "corpus" / "segments"
FINDINGS = ROOT / "findings"

# Excerpts in the committed findings are an identifying handle, not content.
EXCERPT_WORDS = 12


def excerpt(text: str) -> str:
    words = text.split()
    tail = " ..." if len(words) > EXCERPT_WORDS else ""
    return " ".join(words[:EXCERPT_WORDS]) + tail


def _match_rate(marks: list[float], against: list[float], tol: float) -> float:
    if not marks:
        return 0.0
    hit = sum(1 for m in marks if any(abs(m - n) <= tol for n in against))
    return 100 * hit / len(marks)


def agreement(
    a: Segmentation, b: Segmentation, tolerance_s: float, duration_s: float
) -> dict:
    """How often the two methods break together — against chance.

    Raw agreement flatters itself. With a hundred boundaries in fifty
    minutes, a twenty-second window lands on one most of the time whatever
    the boundaries mean, so the number to read is the gap between observed
    agreement and the agreement of the same count of boundaries scattered at
    random. Without that comparison the measurement says nothing.
    """
    import random

    a_marks = [p.start_s for p in a.paragraphs[1:]]
    b_marks = [p.start_s for p in b.paragraphs[1:]]
    if not a_marks or not b_marks:
        return {}

    observed = _match_rate(a_marks, b_marks, tolerance_s)
    reverse = _match_rate(b_marks, a_marks, tolerance_s)

    rng = random.Random(20260803)
    trials = 200
    chance = sum(
        _match_rate(
            a_marks,
            sorted(rng.uniform(0, duration_s) for _ in b_marks),
            tolerance_s,
        )
        for _ in range(trials)
    ) / trials

    return {
        "tolerance_s": tolerance_s,
        f"{a.method}_boundaries": len(a_marks),
        f"{b.method}_boundaries": len(b_marks),
        f"{a.method}_matched_pct": round(observed, 1),
        f"{b.method}_matched_pct": round(reverse, 1),
        "chance_pct": round(chance, 1),
        "lift_pct_points": round(observed - chance, 1),
    }


def scene_file(number: int) -> Path | None:
    for candidate in (SCENES / f"ep{number:02d}_t12.json", SCENES / f"ep{number:02d}.json"):
        if candidate.exists():
            return candidate
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--episode", type=int, default=1)
    args = parser.parse_args()

    ep = next(e for e in CONNECTIONS_1 if e.number == args.episode)
    transcript = TRANSCRIPTS / f"ep{ep.number:02d}-{ep.video_id}.en.json3"
    if not transcript.exists():
        raise SystemExit(f"No transcript at {transcript}; run fetch.py first")

    cues = load_cues(transcript)
    stats = transcript_stats(cues)

    scenes_path = scene_file(ep.number)
    if scenes_path is None:
        raise SystemExit(f"No scene data for ep{ep.number:02d}; run scene detection first")
    scene_data = json.loads(scenes_path.read_text(encoding="utf8"))
    cuts = scene_data["cuts"]

    pause = by_pause(cues)
    visual = by_visual_rhythm(cues, cuts)

    SEGMENTS.mkdir(parents=True, exist_ok=True)
    for seg in (pause, visual):
        (SEGMENTS / f"ep{ep.number:02d}-{seg.method}.json").write_text(
            json.dumps(
                {
                    "episode": ep.number,
                    "title": ep.title,
                    "method": seg.method,
                    "stats": seg.stats(),
                    "paragraphs": [p.to_dict() for p in seg.paragraphs],
                },
                indent=1,
            ),
            encoding="utf8",
        )

    FINDINGS.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []
    w = lines.append
    w(f"# Pilot — Connections ep{ep.number:02d}, “{ep.title}”")
    w("")
    w("Two ways of cutting the same transcript into paragraphs, measured against")
    w("each other. Full paragraph text stays in the gitignored corpus; what")
    w("follows is measurement plus a handle of a dozen words per paragraph.")
    w("")
    w("## The transcript")
    w("")
    w(f"- {stats['cues']} cues, {stats['words']} words over {stats['span_s'] / 60:.1f} min")
    w(f"- {stats['words_per_minute']} words per minute")
    w(
        f"- {scene_data['cut_count']} shot changes detected "
        f"(threshold {scene_data['threshold']}), mean shot "
        f"{scene_data['duration_s'] / max(1, scene_data['cut_count']):.1f}s"
    )
    w("")
    w("A shot every few seconds is why cuts alone cannot mark paragraphs: there")
    w("are an order of magnitude more of them than there are thoughts.")
    w("")
    w("## The two segmentations")
    w("")
    w("| | pause | visual rhythm |")
    w("| --- | --- | --- |")
    ps, vs = pause.stats(), visual.stats()
    for key, label in (
        ("paragraphs", "paragraphs"),
        ("median_words", "median words"),
        ("mean_words", "mean words"),
        ("min_words", "shortest (words)"),
        ("max_words", "longest (words)"),
        ("median_seconds", "median seconds"),
        ("mean_seconds", "mean seconds"),
    ):
        w(f"| {label} | {ps.get(key)} | {vs.get(key)} |")
    w("")
    w("## Do they agree on where a paragraph ends?")
    w("")
    w("| window | pause boundaries near a visual one | same, if visual were random | lift |")
    w("| --- | --- | --- | --- |")
    for tol in (5.0, 10.0, 20.0):
        a = agreement(pause, visual, tol, scene_data["duration_s"])
        w(
            f"| ±{tol:.0f}s | {a['pause_matched_pct']}% | {a['chance_pct']}% "
            f"| {a['lift_pct_points']:+.1f} pts |"
        )
    w("")
    w("Lift is the whole finding: agreement above what scattering the same")
    w("number of boundaries at random would produce.")
    w("")
    for seg in (pause, visual):
        w(f"## First 12 paragraphs — {seg.method}")
        w("")
        w("| # | start | s | words | cuts | boundary | opening words |")
        w("| --- | --- | --- | --- | --- | --- | --- |")
        for p in seg.paragraphs[:12]:
            mm, ss = divmod(int(p.start_s), 60)
            w(
                f"| {p.index} | {mm}:{ss:02d} | {p.duration_s:.0f} | {p.word_count} "
                f"| {p.cuts_within} | {p.boundary_reason} | {excerpt(p.text)} |"
            )
        w("")

    out = FINDINGS / f"pilot-ep{ep.number:02d}.md"
    out.write_text("\n".join(lines), encoding="utf8")
    print(f"wrote {out}")
    print(json.dumps({"pause": ps, "visual": vs}, indent=1))
    for tol in (5.0, 10.0, 20.0):
        print(agreement(pause, visual, tol, scene_data["duration_s"]))


if __name__ == "__main__":
    main()
