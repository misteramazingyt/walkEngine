"""What earns a subject depth, measured rather than guessed.

    python dwell.py

Dwell runs come free from the bridge data: a run is a maximal stretch of
seams where the topic did not change. Across 14 episodes the distribution is
long-tailed — 27% of subjects are touched for one paragraph and dropped,
while runs of four or more are 36% of subjects and carry 67% of all
paragraphs. So the question is not how long a subject is held on average. It
is which subjects earn the long stay.

Three hypotheses to test, none of them ours to assume:

  1. there is simply more to tell about it
  2. it has local sufficiency — it produces what comes next
  3. it has global sufficiency — it bears on where the programme ends

Each run is classified against a closed vocabulary containing those three
and several rivals, and the distribution for long runs is compared against
short ones. If the same reasons appear in both, none of them explains depth
and the finding is that.
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

from episodes import BY_NUMBER
from segment import by_pause
from transcript import load_cues

ROOT = Path(__file__).parent
BRIDGES = ROOT / "corpus" / "bridges"
TRANSCRIPTS = ROOT / "corpus" / "transcripts"
OUT = ROOT / "corpus" / "dwell"
FINDINGS = ROOT / "findings"

REASONS = [
    "much_to_tell",          # 1: internal incident, detail, stages
    "produces_next",         # 2: local sufficiency — it causes what follows
    "bears_on_destination",  # 3: global sufficiency — needed for the ending
    "demonstration",         # Burke is showing or doing something with it
    "scene_worth_inhabiting",
    "a_persons_story",
    "mechanism_needs_steps",
    "stakes_are_here",
    "other",
]

SCHEMA = {
    "type": "object",
    "properties": {
        "runs": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "run_id": {"type": "string"},
                    "subject": {"type": "string"},
                    "primary_reason": {"type": "string", "enum": REASONS},
                    "secondary_reason": {"type": "string", "enum": REASONS},
                    "other_label": {"type": "string"},
                    "why": {"type": "string"},
                },
                "required": ["run_id", "subject", "primary_reason", "why"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["runs"],
    "additionalProperties": False,
}

INSTRUCTIONS = """Each block below is a stretch of consecutive paragraphs in
which a documentary stays on ONE subject. Some stretches are a single
paragraph; some run to a dozen.

For each, name the subject, then say why the programme stayed on it for as
long as it did — choosing the PRIMARY reason from exactly this set:

  much_to_tell            there is a quantity of incident, detail or stages
                          in the thing itself, and telling it takes room
  produces_next           it is what brings about whatever comes after; the
                          stay is earned by its causal work in the sequence
  bears_on_destination    it is needed for where the whole programme is
                          heading, and is being established for later use
  demonstration           the presenter is showing, handling, or doing
                          something with it on screen
  scene_worth_inhabiting  a place or moment good enough to stay inside
  a_persons_story         a particular person's doings carry the stretch
  mechanism_needs_steps   how it works can only be explained in sequence
  stakes_are_here         this is where the consequence or cost lands
  other                   none of these — then give other_label

Give a `secondary_reason` too where one genuinely applies.

Judge from what the text actually spends its words on. A single-paragraph
stretch still has a reason — usually that there was little to say, or that
it was needed only as a step — so classify those honestly rather than
reaching for a flattering explanation."""


def build_client() -> genai.Client:
    key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY") or ""
    if not key.strip():
        raise SystemExit("GEMINI_API_KEY is not set")
    return genai.Client(api_key=key.strip())


def call(client, model: str, prompt: str) -> dict:
    last: Exception | None = None
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
            text = (r.text or "").strip()
            if not text:
                raise RuntimeError("empty response")
            return json.loads(text)
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(2 * (attempt + 1))
    raise SystemExit(f"Gemini failed: {last}")


def runs_for(episode: dict) -> list[tuple[int, int]]:
    """Maximal stretches [start, end] of paragraphs holding one subject."""
    ts = sorted(episode["transitions"], key=lambda x: x["from_index"])
    if not ts:
        return []
    spans: list[tuple[int, int]] = []
    start = ts[0]["from_index"]
    for t in ts:
        if t["topic_changed"]:
            spans.append((start, t["from_index"]))
            start = t["to_index"]
    spans.append((start, ts[-1]["to_index"]))
    return spans


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--model", default="gemini-2.5-flash")
    ap.add_argument("--per-call", type=int, default=4)
    ap.add_argument("--max-paragraph-chars", type=int, default=900)
    args = ap.parse_args()

    client = build_client()
    OUT.mkdir(parents=True, exist_ok=True)

    for path in sorted(BRIDGES.glob("ep*.json")):
        data = json.loads(path.read_text(encoding="utf8"))
        ep = BY_NUMBER[data["episode"]]
        dest = OUT / f"ep{ep.number:02d}.json"
        if dest.exists():
            print(f"ep{ep.number:02d}: already measured")
            continue

        tp = TRANSCRIPTS / f"ep{ep.number:02d}-{ep.video_id}.en.json3"
        paras = {p.index: p.text for p in by_pause(load_cues(tp)).paragraphs}
        spans = runs_for(data)
        results: list[dict] = []

        for i in range(0, len(spans), args.per_call):
            batch = spans[i : i + args.per_call]
            blocks = []
            for a, b in batch:
                body = "\n\n".join(
                    paras.get(n, "")[: args.max_paragraph_chars]
                    for n in range(a, b + 1)
                )
                blocks.append(f"RUN {a}-{b} ({b - a + 1} paragraphs):\n{body}")
            result = call(
                client,
                args.model,
                f"{INSTRUCTIONS}\n\nPROGRAMME: {ep.series} — {ep.title}\n\n"
                + "\n\n---\n\n".join(blocks),
            )
            by_id = {r["run_id"]: r for r in result.get("runs", [])}
            for a, b in batch:
                r = by_id.get(f"{a}-{b}") or by_id.get(f"RUN {a}-{b}")
                if not r:
                    continue
                r["length"] = b - a + 1
                r["episode"] = ep.number
                r["series"] = ep.series
                results.append(r)
            print(f"  ep{ep.number:02d} runs {i + 1}-{i + len(batch)}", flush=True)

        dest.write_text(json.dumps({"runs": results}, indent=1), encoding="utf8")
        print(f"ep{ep.number:02d}: {len(results)} runs classified\n", flush=True)


if __name__ == "__main__":
    main()
