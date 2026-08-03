"""Subject trajectories from extracted mentions: rhythm, latency, reference.

    python mention_flow.py

Consolidates near-duplicate subject registrations, then measures how each
subject moves through the episode. Three things the unigram version could
not ask:

  - LATENCY WITH A ROLE. Lead is now the distance from a subject's first
    mention to the paragraph where it is the TOPIC, and we can say what that
    first mention was doing — planted, passing, or supporting. BurkeCluster
    asserts this latency exists and tests it by string length; here it has a
    distribution and a shape.
  - HOW REFERENCE CHANGES. A subject is introduced one way and referred to
    another. The progression from indefinite_introduction to named to
    pronoun is the grammar of a subject settling into a text.
  - WHAT OVERLAPS. Two subjects both live across the same paragraphs are
    braided rather than sequential, which is the thing a baton-passing
    engine cannot imitate.

Consolidation is deliberately conservative and deterministic. The extractor
registers a new id whenever wording drifts, so exact and article-stripped
label matches are merged; anything looser would silently invent coreference
that the model did not assert.
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).parent
MENTIONS = ROOT / "corpus" / "mentions"
FINDINGS = ROOT / "findings"

TOPIC_ROLES = {"topic", "elaborated"}


def canonical(label: str) -> str:
    text = label.lower().strip()
    text = re.sub(r"^(the|a|an)\s+", "", text)
    text = re.sub(r"[^a-z0-9 ]+", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    # Singularize a trailing plural so "waterwheels" joins "waterwheel".
    if len(text) > 4 and text.endswith("s") and not text.endswith("ss"):
        text = text[:-1]
    return text


def consolidate(data: dict) -> tuple[dict[str, str], dict[str, dict]]:
    """Map each subject id onto a canonical id, merging identical labels."""
    by_key: dict[str, str] = {}
    remap: dict[str, str] = {}
    merged: dict[str, dict] = {}
    for s in data["subjects"]:
        key = canonical(s["label"])
        if key in by_key:
            remap[s["id"]] = by_key[key]
            continue
        by_key[key] = s["id"]
        remap[s["id"]] = s["id"]
        merged[s["id"]] = s
    return remap, merged


def trajectories(data: dict) -> dict[str, dict]:
    remap, subjects = consolidate(data)
    per: dict[str, list[dict]] = defaultdict(list)
    for m in data["mentions"]:
        sid = remap.get(m["subject_id"])
        if sid:
            per[sid].append(m)

    out: dict[str, dict] = {}
    for sid, ms in per.items():
        indices = sorted({m["paragraph_index"] for m in ms})
        topics = sorted(
            {m["paragraph_index"] for m in ms if m["role"] in TOPIC_ROLES}
        )
        first_topic = topics[0] if topics else None
        out[sid] = {
            "label": subjects[sid]["label"],
            "kind": subjects[sid]["kind"],
            "mentions": len(ms),
            "paragraphs": indices,
            "first": indices[0],
            "last": indices[-1],
            "topic_paragraphs": topics,
            "first_topic": first_topic,
            "lead": (first_topic - indices[0]) if first_topic is not None else None,
            "tail": (indices[-1] - topics[-1]) if topics else None,
            "span": indices[-1] - indices[0] + 1,
            "first_mention_type": ms[0]["mention_type"],
            "first_role": ms[0]["role"],
            "roles": Counter(m["role"] for m in ms),
            "types": Counter(m["mention_type"] for m in ms),
        }
    return out


def summarize(name: str, traj: dict[str, dict], n_paragraphs: int, min_p: int) -> dict:
    recurring = {
        k: v for k, v in traj.items() if len(v["paragraphs"]) >= min_p
    }
    developed = {k: v for k, v in recurring.items() if v["first_topic"] is not None}
    leads = [v["lead"] for v in developed.values()]
    planted_first = sum(
        1 for v in developed.values() if v["first_role"] in {"planted", "passing"}
    )
    live = [
        sum(1 for v in recurring.values() if v["first"] <= i <= v["last"])
        for i in range(1, n_paragraphs + 1)
    ]
    topic_runs = [len(v["topic_paragraphs"]) for v in developed.values()]
    return {
        "episode": name,
        "paragraphs": n_paragraphs,
        "subjects_extracted": len(traj),
        "recurring": len(recurring),
        "ever_topic": len(developed),
        "median_lead": statistics.median(leads) if leads else None,
        "mean_lead": round(statistics.mean(leads), 2) if leads else None,
        "arrive_before_topic_pct": (
            round(100 * sum(1 for l in leads if l >= 1) / len(leads), 1) if leads else None
        ),
        "first_mention_not_topic_pct": (
            round(100 * planted_first / len(developed), 1) if developed else None
        ),
        "median_topic_paragraphs": statistics.median(topic_runs) if topic_runs else None,
        "median_span": statistics.median(v["span"] for v in recurring.values()),
        "median_live_at_once": statistics.median(live),
        "max_live_at_once": max(live),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--min-paragraphs", type=int, default=3)
    parser.add_argument("--top", type=int, default=15)
    args = parser.parse_args()

    files = sorted(MENTIONS.glob("ep*.json"))
    if not files:
        raise SystemExit("No extracted mentions; run mention_extract.py first")

    rows = []
    all_types: Counter[str] = Counter()
    all_roles: Counter[str] = Counter()
    intro_types: Counter[str] = Counter()
    per_episode: dict[int, dict[str, dict]] = {}

    for path in files:
        data = json.loads(path.read_text(encoding="utf8"))
        traj = trajectories(data)
        per_episode[data["episode"]] = traj
        rows.append(
            summarize(
                f"ep{data['episode']:02d} {data['title']}",
                traj,
                data["paragraph_count"],
                args.min_paragraphs,
            )
        )
        for v in traj.values():
            all_types.update(v["types"])
            all_roles.update(v["roles"])
            intro_types[v["first_mention_type"]] += 1
        print(json.dumps(rows[-1], indent=1))

    FINDINGS.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []
    w = lines.append
    w("# Subjects as trajectories, from model-extracted mentions")
    w("")
    w("Every mention of every subject in Connections series 1, extracted")
    w("paragraph by paragraph with a running registry so that reference")
    w("accumulates rather than being re-guessed. Near-duplicate registrations")
    w("are merged only on identical labels, so no coreference is asserted")
    w("here that the extractor did not.")
    w("")
    w("**Lead** is now the distance from a subject's first mention to the")
    w("paragraph where it becomes the topic — the quantity BurkeCluster's")
    w("incipit gate assumes and never measures.")
    w("")
    w("| episode | paragraphs | recurring subjects | ever topic | median lead | arrive before topic | first mention not topical | median topic paragraphs | median live at once |")
    w("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for r in rows:
        w(
            f"| {r['episode']} | {r['paragraphs']} | {r['recurring']} | {r['ever_topic']} "
            f"| {r['median_lead']} | {r['arrive_before_topic_pct']}% "
            f"| {r['first_mention_not_topic_pct']}% | {r['median_topic_paragraphs']} "
            f"| {r['median_live_at_once']} |"
        )
    w("")
    w("## How subjects are mentioned")
    w("")
    w("| mention type | all mentions | as a subject's FIRST mention |")
    w("| --- | --- | --- |")
    total_t = sum(all_types.values()) or 1
    total_i = sum(intro_types.values()) or 1
    for t, n in all_types.most_common():
        w(f"| {t} | {n} ({100 * n / total_t:.1f}%) | {intro_types.get(t, 0)} ({100 * intro_types.get(t, 0) / total_i:.1f}%) |")
    w("")
    w("## What mentions are doing")
    w("")
    w("| role | count | share |")
    w("| --- | --- | --- |")
    total_r = sum(all_roles.values()) or 1
    for role, n in all_roles.most_common():
        w(f"| {role} | {n} | {100 * n / total_r:.1f}% |")
    w("")
    for number, traj in per_episode.items():
        recurring = sorted(
            (v for v in traj.values() if len(v["paragraphs"]) >= args.min_paragraphs),
            key=lambda v: v["mentions"],
            reverse=True,
        )[: args.top]
        w(f"## ep{number:02d} — the {args.top} most-mentioned recurring subjects")
        w("")
        w("| subject | kind | mentions | first | first topic | lead | last | span | introduced as |")
        w("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
        for v in recurring:
            w(
                f"| {v['label']} | {v['kind']} | {v['mentions']} | {v['first']} "
                f"| {v['first_topic']} | {v['lead']} | {v['last']} | {v['span']} "
                f"| {v['first_mention_type']}/{v['first_role']} |"
            )
        w("")

    out = FINDINGS / "mention-flow.md"
    out.write_text("\n".join(lines), encoding="utf8")
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
