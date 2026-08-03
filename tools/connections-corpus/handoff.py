"""The mechanism of a handoff: what makes the next subject's arrival earned.

    python handoff.py

Bridge KINDS were measured (consequence, problem_raised, hard_cut...) but
kinds say what the seam sounds like, not what machinery moves under it. The
proposed meta-bridge is: a carrier acting in an environment produced an
output; the output changed the environment; the changed environment is what
the next carrier walks into. If Burke works that way, the handoff at a seam
should be classifiable as an environmental change — but he is also said to
join subjects through persons (same shop, same school, notes passed) and
through parallel developments met later. Count them before inscribing any.

Only topic-change seams are classified — 175 of 653 — with the full
paragraph on each side, so the mechanism can be read rather than guessed
from a clause.
"""

from __future__ import annotations

import argparse
import json
import os
import time
from collections import Counter
from pathlib import Path

from google import genai
from google.genai import types

from episodes import BY_NUMBER
from segment import by_pause
from transcript import load_cues

ROOT = Path(__file__).parent
BRIDGES = ROOT / "corpus" / "bridges"
TRANSCRIPTS = ROOT / "corpus" / "transcripts"
OUT = ROOT / "corpus" / "handoff"

MECHANISMS = [
    "changed_conditions",   # A's output altered law, price, availability,
                            # infrastructure or expectation; B responds to it
    "created_demand",       # A created an appetite, market, audience or
                            # problem that B exists to supply or solve
    "object_travels",       # a specific thing from A — text, device, sample,
                            # technique — arrives in B's hands
    "person_travels",       # a person connects them: moved, corresponded,
                            # taught, met, shared a shop, school or society
    "parallel_joined",      # A and B developed separately and are joined at
                            # a meeting point the programme supplies
    "pure_sequence",        # nothing structural; the narration simply moves
    "other",
]

SCHEMA = {
    "type": "object",
    "properties": {
        "seams": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "seam_id": {"type": "string"},
                    "mechanism": {"type": "string", "enum": MECHANISMS},
                    "other_label": {"type": "string"},
                    "evidence": {"type": "string"},
                    "personal_texture": {"type": "boolean"},
                },
                "required": ["seam_id", "mechanism", "evidence", "personal_texture"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["seams"],
    "additionalProperties": False,
}

INSTRUCTIONS = """Each block is a SEAM: the paragraph before a topic change
and the paragraph after it, from a television documentary.

For each seam, name the MECHANISM that makes the second subject's arrival
earned — the machinery under the transition, not its phrasing:

  changed_conditions  the first subject's output altered shared conditions —
                      a law in force, a price fallen, a material available,
                      an expectation created — and the second responds to
                      that alteration
  created_demand      the first created an appetite, market, audience or
                      problem that the second exists to supply or solve
  object_travels      a specific thing from the first — a text, a device, a
                      technique, a sample — arrives in the second's hands
  person_travels      a person connects them: travelled, corresponded,
                      taught, met, shared a shop, a school, a society
  parallel_joined     the two developed separately and the programme joins
                      them at a meeting point
  pure_sequence       nothing structural; the narration simply moves on
  other               none of these — give other_label

Quote the words that show the mechanism in `evidence`, from either side of
the seam.

`personal_texture` — true when the link is carried in a homely, anecdotal
register: individuals who knew each other, worked in the same place, met
again years later. This can be true alongside any mechanism.

Judge the machinery actually shown on screen, not what a historian would
say really connected the two subjects."""


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
                    max_output_tokens=24000,
                ),
            )
            return json.loads((r.text or "").strip())
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(2 * (attempt + 1))
    raise SystemExit(f"Gemini failed: {last}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--model", default="gemini-2.5-flash")
    ap.add_argument("--per-call", type=int, default=4)
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
        changes = [t for t in data["transitions"] if t["topic_changed"]]
        results: list[dict] = []

        for i in range(0, len(changes), args.per_call):
            batch = changes[i : i + args.per_call]
            blocks = []
            for t in batch:
                a = paras.get(t["from_index"], "")[:1100]
                b = paras.get(t["to_index"], "")[:1100]
                blocks.append(
                    f"SEAM {t['from_index']}->{t['to_index']}:\n"
                    f"BEFORE:\n{a}\n\nAFTER:\n{b}"
                )
            result = call(
                client,
                args.model,
                f"{INSTRUCTIONS}\n\nPROGRAMME: {ep.series} — {ep.title}\n\n"
                + "\n\n=====\n\n".join(blocks),
            )
            wanted = {f"{t['from_index']}->{t['to_index']}" for t in batch}
            for s in result.get("seams", []):
                if s["seam_id"] in wanted:
                    s["episode"] = ep.number
                    s["series"] = ep.series
                    results.append(s)
            print(f"  ep{ep.number:02d} seams {i + 1}-{i + len(batch)}", flush=True)

        dest.write_text(json.dumps({"seams": results}, indent=1), encoding="utf8")
        print(f"ep{ep.number:02d}: {len(results)} seams classified", flush=True)

    # Report.
    seams = [
        s
        for p in sorted(OUT.glob("ep*.json"))
        for s in json.loads(p.read_text(encoding="utf8"))["seams"]
    ]
    if not seams:
        return
    print(f"\n{len(seams)} topic-change seams classified")
    c = Counter(s["mechanism"] for s in seams)
    for k, n in c.most_common():
        print(f"  {k:<20}{100 * n / len(seams):>6.1f}%")
    quaint = sum(1 for s in seams if s["personal_texture"])
    print(f"\npersonal texture on {100 * quaint / len(seams):.1f}% of seams")


if __name__ == "__main__":
    main()
