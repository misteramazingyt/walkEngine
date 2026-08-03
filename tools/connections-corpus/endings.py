"""How Burke ends, and what glides through the whole while subjects change.

    python endings.py

Two questions, both computational, neither previously asked.

ENDINGS. Earlier work found no act structure: every bridge kind's MEAN
position sat between 0.48 and 0.56, so nothing clustered anywhere. But a
mean over the whole programme is exactly the statistic that hides an ending
— a final tenth cannot move a mean computed over ten tenths. So this
compares the last sixth against the middle directly, on everything already
available without a model: seam kinds, dwell lengths, address, questions,
sentence length, and whether the close reaches back to the opening.

META-ARC. The mention work distinguished located subjects, which are
concentrated somewhere, from ambient terms, which recur everywhere and
belong to no passage. Ambient terms were treated as noise and filtered out.
That was probably wrong: a term present throughout while the subjects change
under it is the closest thing in the data to a through-line, and it is what
a viewer would call what the programme is *about* as distinct from what it
is *on*.
"""

from __future__ import annotations

import json
import re
import statistics
from collections import Counter, defaultdict
from pathlib import Path

from episodes import BY_NUMBER
from segment import by_pause
from subject_flow import STOP, terms_of
from transcript import load_cues

ROOT = Path(__file__).parent
BRIDGES = ROOT / "corpus" / "bridges"
TRANSCRIPTS = ROOT / "corpus" / "transcripts"
FINDINGS = ROOT / "findings"

TAIL = 1 / 6  # the closing sixth
HEAD = 1 / 6

SECOND = re.compile(r"\b(you|your|you're|you've|yourself)\b", re.I)
FIRST = re.compile(r"\b(we|our|us)\b", re.I)


def surface(paragraphs: list[str]) -> dict:
    words = sum(len(p.split()) for p in paragraphs) or 1
    sents = [s for p in paragraphs for s in re.split(r"[.!?]+", p) if s.strip()]
    return {
        "second_per_100w": round(100 * sum(len(SECOND.findall(p)) for p in paragraphs) / words, 2),
        "we_per_100w": round(100 * sum(len(FIRST.findall(p)) for p in paragraphs) / words, 2),
        "questions_per_para": round(sum(p.count("?") for p in paragraphs) / max(1, len(paragraphs)), 2),
        "median_sentence_words": round(statistics.median([len(s.split()) for s in sents]) if sents else 0, 1),
        "median_para_words": round(statistics.median([len(p.split()) for p in paragraphs]), 1),
    }


def main() -> None:
    head_all: list[str] = []
    mid_all: list[str] = []
    tail_all: list[str] = []
    tail_kinds: Counter[str] = Counter()
    mid_kinds: Counter[str] = Counter()
    tail_runs: list[int] = []
    mid_runs: list[int] = []
    callback: list[float] = []
    arc_terms: Counter[str] = Counter()
    arc_examples: dict[str, list[str]] = defaultdict(list)

    for path in sorted(BRIDGES.glob("ep*.json")):
        data = json.loads(path.read_text(encoding="utf8"))
        ep = BY_NUMBER[data["episode"]]
        tp = TRANSCRIPTS / f"ep{ep.number:02d}-{ep.video_id}.en.json3"
        paras = [p.text for p in by_pause(load_cues(tp)).paragraphs]
        n = len(paras)
        h, t = max(1, int(n * HEAD)), max(1, int(n * TAIL))
        head_all += paras[:h]
        mid_all += paras[h : n - t]
        tail_all += paras[n - t :]

        for x in data["transitions"]:
            pos = x["from_index"] / max(1, n)
            (tail_kinds if pos >= 1 - TAIL else mid_kinds)[x["bridge_kind"]] += 1

        # Dwell runs, split by where the run starts.
        ts = sorted(data["transitions"], key=lambda x: x["from_index"])
        run, start = 1, ts[0]["from_index"] if ts else 1
        for x in ts:
            if x["topic_changed"]:
                (tail_runs if start / max(1, n) >= 1 - TAIL else mid_runs).append(run)
                run, start = 1, x["to_index"]
            else:
                run += 1

        # Does the close reach back to the opening?
        opening = set(terms_of(" ".join(paras[:h])))
        closing = terms_of(" ".join(paras[n - t :]))
        if closing:
            callback.append(sum(1 for w in closing if w in opening) / len(closing))

        # A through-line: a term present across most of the programme.
        seen_in = defaultdict(set)
        for i, p in enumerate(paras):
            for w in set(terms_of(p)):
                seen_in[w].add(int(6 * i / max(1, n)))
        for w, sixths in seen_in.items():
            if len(sixths) >= 5:
                arc_terms[w] += 1
                if len(arc_examples[w]) < 3:
                    arc_examples[w].append(f"ep{ep.number:02d}")

    print(f"closing sixth vs middle — {len(tail_all)} paragraphs vs {len(mid_all)}\n")
    ms, ts_ = surface(mid_all), surface(tail_all)
    print(f"{'':<26}{'middle':>10}{'ending':>10}{'ratio':>9}")
    print("-" * 55)
    for k in ms:
        r = ts_[k] / ms[k] if ms[k] else 0
        print(f"{k:<26}{ms[k]:>10}{ts_[k]:>10}{r:>8.2f}x")

    print("\nseam kinds")
    print(f"{'':<26}{'middle':>10}{'ending':>10}")
    tk, mk = sum(tail_kinds.values()) or 1, sum(mid_kinds.values()) or 1
    for k, _ in mid_kinds.most_common(7):
        print(f"{k:<26}{100*mid_kinds[k]/mk:>9.1f}%{100*tail_kinds[k]/tk:>9.1f}%")

    print(f"\ndwell run length   middle {statistics.mean(mid_runs):.2f}   ending {statistics.mean(tail_runs or [0]):.2f}")
    print(f"closing words also in opening: {100*statistics.mean(callback):.1f}%")

    print(f"\nthrough-lines — terms present in 5+ sixths of an episode")
    print(f"  {len([w for w,c in arc_terms.items() if c >= 6])} appear in 6+ episodes")
    for w, c in arc_terms.most_common(24):
        print(f"    {w:<18} {c} episodes")


if __name__ == "__main__":
    main()
