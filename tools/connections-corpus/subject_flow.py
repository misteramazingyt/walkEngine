"""How subjects move through paragraphs — rhythm, latency, recurrence.

    python subject_flow.py

Categorizing each paragraph as a typed unit produced 136 distinct labels for
136 paragraphs: no category recurred, so nothing generalized. The failure is
informative. A paragraph is not the bearer of a subject; a subject is a
thing that ENTERS the text, is mentioned before it matters, becomes what the
text is about, then recedes while still being referred to.

So this measures trajectories rather than assigning types. For every term
that recurs, we ask when it was first mentioned, when it became dense, how
long it stayed, whether it came back, and how far its arrival preceded its
prominence.

That last quantity is the one BurkeCluster actually needs. Its incipit gate
asserts that a new subject must already have been latent in the previous
narration — an assertion the engine tests by string length. Here it becomes
a measurable distribution: how far ahead of itself does Burke plant a
subject, in practice?

No model is called. This is arithmetic over the transcript.
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from episodes import CONNECTIONS_1
from segment import by_pause
from transcript import load_cues

ROOT = Path(__file__).parent
TRANSCRIPTS = ROOT / "corpus" / "transcripts"
FINDINGS = ROOT / "findings"

STOP = set(
    """a an the and or but so if then than that this these those there here
    is are was were be been being am do does did doing have has had having
    will would shall should can could may might must of in on at to for from
    by with about into over after before under above between through during
    without within along across behind beyond up down out off again further
    once all any both each few more most other some such no nor not only own
    same too very just now also as it its it's they them their we us our you
    your i me my he him his she her hers who whom which what when where why
    how because while until although though even still yet ever never always
    one two three four five six seven eight nine ten thing things way ways
    got get gets go goes going come comes came like well much many made make
    makes look looks looking see saw seen say says said know knows knew take
    takes took put puts back down out first last next new old great good
    little long right left thats theres im ive dont didnt cant wont let lets
    something anything nothing everything someone anyone everyone bit lot
    kind sort course actually really quite rather perhaps maybe indeed"""
    .split()
)

WORD = re.compile(r"[a-z][a-z'-]+")


def normalize(word: str) -> str:
    word = word.strip("'-")
    # Crude lemmatization: enough to keep "engines" and "engine" together
    # without dragging a morphology library into a measurement script.
    for suffix in ("ies", "es", "s"):
        if len(word) > 4 and word.endswith(suffix):
            if suffix == "ies":
                return word[:-3] + "y"
            if suffix == "es" and word[-4] in "sxzh":
                return word[:-2]
            if suffix == "s" and not word.endswith("ss"):
                return word[:-1]
    return word


def terms_of(text: str) -> list[str]:
    return [
        normalize(w)
        for w in WORD.findall(text.lower())
        if w not in STOP and len(w) > 2 and normalize(w) not in STOP
    ]


@dataclass
class Trajectory:
    term: str
    counts: dict[int, int]          # paragraph index -> mentions

    @property
    def paragraphs(self) -> list[int]:
        return sorted(self.counts)

    @property
    def first(self) -> int:
        return self.paragraphs[0]

    @property
    def last(self) -> int:
        return self.paragraphs[-1]

    @property
    def peak(self) -> int:
        """Where the term is densest — where the text is *about* it."""
        return max(self.counts, key=lambda i: (self.counts[i], -i))

    @property
    def total(self) -> int:
        return sum(self.counts.values())

    @property
    def lead(self) -> int:
        """Paragraphs between first mention and peak: planted-ahead distance."""
        return self.peak - self.first

    @property
    def tail(self) -> int:
        return self.last - self.peak

    @property
    def span(self) -> int:
        return self.last - self.first + 1

    def concentration(self, radius: int = 2) -> float:
        """Share of mentions falling within `radius` paragraphs of the peak.

        This is what separates a subject from the programme's ambient
        vocabulary. "People" and "time" recur everywhere and belong to no
        passage; "waterwheel" is discussed somewhere in particular. Without
        this filter every common noun counts as a subject and the measured
        rhythm is the rhythm of English, not of Burke.
        """
        near = sum(
            n for i, n in self.counts.items() if abs(i - self.peak) <= radius
        )
        return near / self.total

    @property
    def gaps(self) -> list[int]:
        """Silences inside the span — a return after absence is recurrence."""
        ps = self.paragraphs
        return [b - a - 1 for a, b in zip(ps, ps[1:]) if b - a > 1]

    @property
    def returns(self) -> int:
        return sum(1 for g in self.gaps if g >= 2)


def build(
    paragraph_terms: list[list[str]], min_paragraphs: int, min_concentration: float
) -> tuple[list[Trajectory], list[Trajectory]]:
    """Returns (located subjects, ambient vocabulary) — the split matters."""
    counts: dict[str, dict[int, int]] = defaultdict(dict)
    for i, terms in enumerate(paragraph_terms, start=1):
        for t in terms:
            counts[t][i] = counts[t].get(i, 0) + 1
    recurring = [
        Trajectory(term, c)
        for term, c in counts.items()
        if len(c) >= min_paragraphs and sum(c.values()) >= min_paragraphs + 1
    ]
    located = [t for t in recurring if t.concentration() >= min_concentration]
    ambient = [t for t in recurring if t.concentration() < min_concentration]
    return located, ambient


def summarize(
    name: str,
    trajectories: list[Trajectory],
    n_paragraphs: int,
    ambient: int = 0,
) -> dict:
    if not trajectories:
        return {}
    lead = [t.lead for t in trajectories]
    span = [t.span for t in trajectories]
    tail = [t.tail for t in trajectories]
    planted = sum(1 for t in trajectories if t.lead >= 1)
    returning = sum(1 for t in trajectories if t.returns >= 1)

    # How many recurring subjects are "live" (between first and last mention)
    # at any given paragraph — the braid, rather than a baton-pass.
    live = [
        sum(1 for t in trajectories if t.first <= i <= t.last)
        for i in range(1, n_paragraphs + 1)
    ]
    return {
        "episode": name,
        "paragraphs": n_paragraphs,
        "located_subjects": len(trajectories),
        "ambient_terms": ambient,
        "median_lead": statistics.median(lead),
        "mean_lead": round(statistics.mean(lead), 2),
        "planted_before_peak_pct": round(100 * planted / len(trajectories), 1),
        "median_span": statistics.median(span),
        "mean_span": round(statistics.mean(span), 2),
        "median_tail": statistics.median(tail),
        "returns_after_absence_pct": round(100 * returning / len(trajectories), 1),
        "median_live_at_once": statistics.median(live),
        "max_live_at_once": max(live),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--min-paragraphs", type=int, default=3)
    parser.add_argument("--top", type=int, default=15)
    parser.add_argument("--min-concentration", type=float, default=0.6)
    args = parser.parse_args()

    all_rows = []
    per_episode: dict[int, list[Trajectory]] = {}
    counts_paragraphs: dict[int, int] = {}

    for ep in CONNECTIONS_1:
        path = TRANSCRIPTS / f"ep{ep.number:02d}-{ep.video_id}.en.json3"
        if not path.exists():
            continue
        seg = by_pause(load_cues(path))
        paragraph_terms = [terms_of(p.text) for p in seg.paragraphs]
        trajectories, ambient = build(
            paragraph_terms, args.min_paragraphs, args.min_concentration
        )
        per_episode[ep.number] = trajectories
        counts_paragraphs[ep.number] = len(seg.paragraphs)
        row = summarize(
            f"ep{ep.number:02d} {ep.title}",
            trajectories,
            len(seg.paragraphs),
            len(ambient),
        )
        all_rows.append(row)
        print(json.dumps(row, indent=1))
        print()

    FINDINGS.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []
    w = lines.append
    w("# How subjects move through paragraphs")
    w("")
    w("Measured over pause-segmented Connections series 1. No model involved:")
    w("these are counts of where terms appear across paragraph indices.")
    w("")
    w("> **These numbers are not yet usable.** The unit of analysis is a")
    w("> normalized unigram against a hand-written stoplist, and the densest")
    w("> \"subjects\" it reports for episode 1 include *enough*, *you've*,")
    w("> *hey*, and *far* alongside *plow*, *farm*, and *train*. The")
    w("> trajectory measurements below are therefore computed over a")
    w("> population that is part subject and part leaked function word, and")
    w("> the medians inherit that contamination. What the table establishes")
    w("> is that the shape is measurable, not what its values are. Proper")
    w("> mention extraction — noun phrases and named entities, not bag of")
    w("> words — has to come first.")
    w("")
    w("A *recurring subject* here is any term appearing in at least")
    w(f"{args.min_paragraphs} paragraphs. Its **lead** is the distance from its first")
    w("mention to the paragraph where it is densest — how far ahead of itself")
    w("the programme plants a thing before making it the topic. Its **span** is")
    w("first to last mention, and it **returns** if it comes back after an")
    w("absence of two or more paragraphs.")
    w("")
    w("| episode | paragraphs | located subjects | ambient terms | median lead | planted early | median span | median tail | returns | median live at once |")
    w("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for r in all_rows:
        w(
            f"| {r['episode']} | {r['paragraphs']} | {r['located_subjects']} "
            f"| {r['ambient_terms']} | {r['median_lead']} | {r['planted_before_peak_pct']}% "
            f"| {r['median_span']} | {r['median_tail']} | {r['returns_after_absence_pct']}% "
            f"| {r['median_live_at_once']} |"
        )
    w("")

    for number, trajectories in per_episode.items():
        ep = next(e for e in CONNECTIONS_1 if e.number == number)
        top = sorted(trajectories, key=lambda t: t.total, reverse=True)[: args.top]
        w(f"## ep{number:02d} — the {args.top} densest subjects")
        w("")
        w("| term | mentions | paragraphs | first | peak | last | lead | tail | returns |")
        w("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
        for t in top:
            w(
                f"| {t.term} | {t.total} | {len(t.counts)} | {t.first} | {t.peak} "
                f"| {t.last} | {t.lead} | {t.tail} | {t.returns} |"
            )
        w("")

    out = FINDINGS / "subject-flow.md"
    out.write_text("\n".join(lines), encoding="utf8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
