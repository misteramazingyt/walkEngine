"""The rhythm of altitude: how sentences move between general and particular.

    python altitude.py --episode 1 3 4
    python altitude.py --draft ../../drafts/selfing-ended.md
    python altitude.py --report

Our own paragraphs were described as running: a general statement of change,
a particular instance, a descent into detail, an ascent back into
generalisation. An arch, every time, and obvious once seen.

That is a claim about ALTITUDE — how far above the ground of particular
things a sentence sits — and altitude has not been measured. The narration
work classified sentences by FUNCTION (setup, problem, reversal), which is a
different axis: a reversal can be stated at any height.

So each sentence is placed on a four-step scale and the sequences compared.
If Burke also arches, the shape is the form and not our fault. If he does
not, whatever he does instead is the thing to imitate.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import time
from collections import Counter, defaultdict
from pathlib import Path

from google import genai
from google.genai import types

from episodes import ALL_EPISODES
from segment import by_pause
from transcript import load_cues

ROOT = Path(__file__).parent
TRANSCRIPTS = ROOT / "corpus" / "transcripts"
OUT = ROOT / "corpus" / "altitude"

LEVELS = ["universal", "epochal", "instance", "granular"]
HEIGHT = {"universal": 4, "epochal": 3, "instance": 2, "granular": 1}

SCHEMA = {
    "type": "object",
    "properties": {
        "paragraphs": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "sentences": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "opening": {"type": "string"},
                                "level": {"type": "string", "enum": LEVELS},
                                "introduces_subject": {"type": "boolean"},
                            },
                            "required": ["opening", "level", "introduces_subject"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["index", "sentences"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["paragraphs"],
    "additionalProperties": False,
}

INSTRUCTIONS = """Place every sentence on a scale of altitude - how far it
sits above the ground of particular things.

  universal   a claim about how things are, with no time or place attached
  epochal     about a period, a society, a class, a trend
  instance    one identifiable thing, event, person or text
  granular    physical, sensory or numeric detail you could photograph or
              count

Quote the first few words of each sentence in `opening` so the placement can
be checked.

`introduces_subject` - true for the sentence that first brings this
paragraph's main subject into view.

Judge the sentence as written, not the topic it belongs to. A sentence about
the Reformation is granular if it describes a nailed sheet of paper, and a
sentence about one monk is universal if it claims something about everyone."""


def build_client() -> genai.Client:
    key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY") or ""
    if not key.strip():
        raise SystemExit("GEMINI_API_KEY is not set")
    return genai.Client(api_key=key.strip())


def call(client, model, prompt):
    last = None
    for attempt in range(4):
        try:
            r = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_json_schema=SCHEMA,
                    temperature=0.1,
                    max_output_tokens=32000,
                ),
            )
            return json.loads((r.text or "").strip())
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(2 * (attempt + 1))
    raise SystemExit(f"Gemini failed: {last}")


def measure(client, model, label, paragraphs, window):
    out = []
    for start in range(0, len(paragraphs), window):
        chunk = list(enumerate(paragraphs, start=1))[start : start + window]
        body = "\n\n".join(f"[{i}] {t}" for i, t in chunk)
        result = call(
            client, model, f"{INSTRUCTIONS}\n\nSOURCE: {label}\n\nPARAGRAPHS:\n{body}"
        )
        valid = {i for i, _ in chunk}
        out.extend(p for p in result.get("paragraphs", []) if p["index"] in valid)
        print(f"  {label} {chunk[0][0]}-{chunk[-1][0]}", flush=True)
    return {"label": label, "paragraphs": out}


def report() -> None:
    groups = defaultdict(list)
    for f in sorted(OUT.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf8"))
        groups["ours" if f.name.startswith("draft") else "burke"].extend(d["paragraphs"])

    for name, paras in groups.items():
        sents = [s for p in paras for s in p["sentences"]]
        if not sents:
            continue
        print(f"\n=== {name}: {len(paras)} paragraphs, {len(sents)} sentences ===")
        counts = Counter(s["level"] for s in sents)
        for level in LEVELS:
            print(f"  {level:<12}{100 * counts[level] / len(sents):>6.1f}%")
        print(
            f"  mean altitude {statistics.mean(HEIGHT[s['level']] for s in sents):.2f}"
        )

        arch = descent = other = 0
        for p in paras:
            heights = [HEIGHT[s["level"]] for s in p["sentences"]]
            if len(heights) < 3:
                continue
            low = min(heights)
            if heights[0] - low >= 1 and heights[-1] - low >= 1:
                arch += 1
            elif heights[0] - heights[-1] >= 1:
                descent += 1
            else:
                other += 1
        total = arch + descent + other or 1
        print(f"  arch, down then back up  {100 * arch / total:>5.1f}%")
        print(f"  descent, ends lower      {100 * descent / total:>5.1f}%")
        print(f"  flat or rising           {100 * other / total:>5.1f}%")

        intro = [
            (i, s)
            for p in paras
            for i, s in enumerate(p["sentences"])
            if s["introduces_subject"]
        ]
        if intro:
            print(
                f"  subject introduced at sentence "
                f"{statistics.mean(i for i, _ in intro) + 1:.1f}"
            )
            at = Counter(s["level"] for _, s in intro)
            print(
                "  introduced at: "
                + ", ".join(
                    f"{k} {100 * at[k] / len(intro):.0f}%" for k in LEVELS if at[k]
                )
            )

        moves = Counter()
        for p in paras:
            levels = [s["level"] for s in p["sentences"]]
            for a, b in zip(levels, levels[1:]):
                moves[(a, b)] += 1
        total_moves = sum(moves.values()) or 1
        print(
            "  commonest moves: "
            + ", ".join(
                f"{a[:4]}->{b[:4]} {100 * n / total_moves:.0f}%"
                for (a, b), n in moves.most_common(4)
            )
        )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--draft")
    ap.add_argument("--episode", type=int, nargs="*")
    ap.add_argument("--model", default="gemini-2.5-flash")
    ap.add_argument("--window", type=int, default=5)
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    if args.report:
        report()
        return

    client = build_client()
    if args.draft:
        path = Path(args.draft)
        blocks = path.read_text(encoding="utf8").split("\n### ")[1:]
        paras = [b.split("\n", 1)[1].strip() for b in blocks if len(b.split()) > 40]
        data = measure(client, args.model, path.stem, paras, args.window)
        (OUT / f"draft-{path.stem}.json").write_text(
            json.dumps(data, indent=1), encoding="utf8"
        )
        report()
        return

    for ep in ALL_EPISODES:
        tp = TRANSCRIPTS / f"ep{ep.number:02d}-{ep.video_id}.en.json3"
        if not tp.exists() or (args.episode and ep.number not in args.episode):
            continue
        dest = OUT / f"ep{ep.number:02d}.json"
        if dest.exists():
            continue
        paras = [p.text for p in by_pause(load_cues(tp)).paragraphs]
        data = measure(client, args.model, f"ep{ep.number:02d}", paras, args.window)
        dest.write_text(json.dumps(data, indent=1), encoding="utf8")
    report()


if __name__ == "__main__":
    main()
