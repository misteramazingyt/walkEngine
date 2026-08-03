"""Turn measured transitions into rules, stated in plain language.

    python bridge_rules.py

Reads the per-episode bridge measurements and reports the distribution of
bridge kinds, how it differs between the 1978 series, the 1997 series and
the documentaries, and how much continuity is carried by a persisting
subject rather than by a sentence at the seam.

The `other` share is reported first and deliberately: a closed vocabulary
that fails to fit its material produces a tidy table and a false finding,
and the previous attempt at this measurement failed exactly that way.
"""

from __future__ import annotations

import json
import statistics
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).parent
BRIDGES = ROOT / "corpus" / "bridges"
FINDINGS = ROOT / "findings"

KIND_GLOSS = {
    "carried_subject": "a subject already in play simply continues",
    "consequence": "the next follows from what the last produced",
    "problem_raised": "the last leaves a difficulty; the next takes it up",
    "instrument_needed": "the next supplies a means the last showed was needed",
    "contrast": "the next is set against the last",
    "resemblance": "joined because alike — metaphor, echo, figure",
    "question_posed": "a question is asked, then pursued",
    "return_to_earlier": "something dropped earlier comes back",
    "hard_cut": "no bridge; the new subject simply begins",
    "other": "none of the above fitted",
}


def main() -> None:
    files = sorted(BRIDGES.glob("ep*.json"))
    if not files:
        raise SystemExit("No measurements; run bridges.py first")

    episodes = [json.loads(p.read_text(encoding="utf8")) for p in files]
    all_t = [t for e in episodes for t in e["transitions"]]
    changed = [t for t in all_t if t["topic_changed"]]
    same = [t for t in all_t if not t["topic_changed"]]

    by_series: dict[str, list[dict]] = defaultdict(list)
    for e in episodes:
        by_series[e["series"]].extend(e["transitions"])

    kinds = Counter(t["bridge_kind"] for t in all_t)
    kinds_changed = Counter(t["bridge_kind"] for t in changed)
    other_labels = Counter(
        t.get("other_label", "").strip().lower()
        for t in all_t
        if t["bridge_kind"] == "other" and t.get("other_label")
    )
    carries_nothing = sum(
        1 for t in changed if t["carries_over"].strip().lower() in {"nothing", "none", ""}
    )

    lines: list[str] = []
    w = lines.append
    w("# What carries Burke across a topic change")
    w("")
    w(
        f"Measured over {len(episodes)} episodes — "
        f"{sum(1 for e in episodes if e['series'] == 'C1')} from Connections 1 (1978), "
        f"{sum(1 for e in episodes if e['series'] == 'C3')} from Connections 3 (1997), "
        f"{sum(1 for e in episodes if e['series'] == 'DOC')} standalone documentaries — "
        f"{len(all_t)} adjacent paragraph pairs in total."
    )
    w("")
    w("Bridge kinds were a CLOSED vocabulary with an `other` escape. The share")
    w("of `other` is the first number to read: a closed set that does not fit")
    w("its material yields a tidy table and a false finding, which is how the")
    w("first attempt at this measurement failed.")
    w("")
    w(f"**`other` accounts for {100 * kinds['other'] / max(1, len(all_t)):.1f}% of transitions.**")
    if other_labels:
        w("")
        w("What it was called when it fired:")
        w("")
        for label, n in other_labels.most_common(8):
            w(f"- {label} ({n})")
    w("")
    w("## Does the topic change at all?")
    w("")
    w(
        f"- {len(changed)} of {len(all_t)} seams change subject "
        f"({100 * len(changed) / max(1, len(all_t)):.1f}%)"
    )
    w(
        f"- {len(same)} continue the same subject "
        f"({100 * len(same) / max(1, len(all_t)):.1f}%)"
    )
    w("")
    w("## Bridge kinds, all seams")
    w("")
    w("| kind | share | what it means |")
    w("| --- | --- | --- |")
    for kind, n in kinds.most_common():
        w(f"| `{kind}` | {100 * n / max(1, len(all_t)):.1f}% | {KIND_GLOSS.get(kind, '')} |")
    w("")
    w("## Bridge kinds where the topic actually changes")
    w("")
    w("This is the population that matters for writing a transition.")
    w("")
    w("| kind | share of topic changes |")
    w("| --- | --- |")
    for kind, n in kinds_changed.most_common():
        w(f"| `{kind}` | {100 * n / max(1, len(changed)):.1f}% |")
    w("")
    w("## Does anything persist across the seam?")
    w("")
    w(
        f"At a topic change, {100 * (len(changed) - carries_nothing) / max(1, len(changed)):.1f}% "
        f"of seams still carry something over — a subject, object, person or "
        f"problem named on both sides. Only "
        f"{100 * carries_nothing / max(1, len(changed)):.1f}% carry nothing."
    )
    w("")
    w("## Across the three bodies of work")
    w("")
    w("| kind | " + " | ".join(sorted(by_series)) + " |")
    w("| --- | " + " | ".join("---" for _ in by_series) + " |")
    for kind in [k for k, _ in kinds.most_common()]:
        row = []
        for series in sorted(by_series):
            group = by_series[series]
            n = sum(1 for t in group if t["bridge_kind"] == kind)
            row.append(f"{100 * n / max(1, len(group)):.1f}%")
        w(f"| `{kind}` | " + " | ".join(row) + " |")
    w("")
    w("## Examples, quoted")
    w("")
    for kind, _ in kinds_changed.most_common(6):
        examples = [
            t for t in changed if t["bridge_kind"] == kind and len(t["bridge_text"]) > 40
        ][:2]
        if not examples:
            continue
        w(f"**`{kind}`**")
        w("")
        for ex in examples:
            text = ex["bridge_text"].strip().replace("\n", " ")
            w(f"- “{text[:180]}” — carries over: {ex['carries_over']}")
        w("")

    FINDINGS.mkdir(parents=True, exist_ok=True)
    out = FINDINGS / "bridges.md"
    out.write_text("\n".join(lines), encoding="utf8")
    print("\n".join(lines[:80]))
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
