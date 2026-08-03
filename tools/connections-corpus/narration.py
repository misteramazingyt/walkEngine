"""The grammar INSIDE a paragraph — how Burke narrates one subject.

    python narration.py                    # the corpus
    python narration.py --draft ../../drafts/selfing.md

Everything measured so far has been about seams: what carries a reader from
one subject to the next. Nothing has looked at what happens while a subject
is being narrated, which is where our own writing plainly fails — each beat
is a thing, the person who made it, and what it did, repeated. No turn, no
surprise, nothing withheld.

So this segments each paragraph into MOVES from a closed vocabulary and
records the sequence. The between-paragraph measurement found no grammar at
all — every lift 1.0. If there is one anywhere, it should be here, because
this is the scale at which a paragraph either has a shape or is a list.
"""

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

from google import genai
from google.genai import types

from episodes import ALL_EPISODES
from segment import by_pause
from transcript import load_cues

ROOT = Path(__file__).parent
TRANSCRIPTS = ROOT / "corpus" / "transcripts"
OUT = ROOT / "corpus" / "narration"
DEFAULT_MODEL = "gemini-2.5-flash"

MOVES = [
    "address",      # speaks to the viewer: you, your, imagine
    "scene",        # puts you in a concrete place or moment
    "setup",        # how things stood, or what everyone believed
    "problem",      # a difficulty, need, limit or obstacle
    "attempt",      # somebody tries something
    "reversal",     # it turns out otherwise than the setup implied
    "consequence",  # what followed from it
    "unintended",   # a consequence nobody wanted or foresaw
    "particular",   # a date, number, name or object doing real work
    "aside",        # joke, irony, digression, wry remark
    "stakes",       # why any of this matters
    "other",
]

SCHEMA = {
    "type": "object",
    "properties": {
        "paragraphs": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "moves": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "move": {"type": "string", "enum": MOVES},
                                "text": {"type": "string"},
                                "other_label": {"type": "string"},
                            },
                            "required": ["move", "text"],
                            "additionalProperties": False,
                        },
                    },
                    "has_turn": {"type": "boolean"},
                    "what_turns": {"type": "string"},
                },
                "required": ["index", "moves", "has_turn", "what_turns"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["paragraphs"],
    "additionalProperties": False,
}

INSTRUCTIONS = """Segment each paragraph into its MOVES, in order.

A move is a stretch of one or more sentences doing one job. Most paragraphs
have between three and eight. Quote the opening words of each move in
`text`, verbatim, so the segmentation can be checked.

Choose each move from exactly this set:

  address      speaks to the viewer directly — you, your, imagine, suppose
  scene        puts the viewer in a concrete place or moment
  setup        how things stood, or what everyone took to be the case
  problem      a difficulty, need, limit, or obstacle
  attempt      somebody tries something
  reversal     it turns out otherwise than the setup implied — the swerve
  consequence  what followed from it
  unintended   a consequence nobody wanted, foresaw, or intended
  particular   a date, number, name or object doing real work in the account
  aside        a joke, an irony, a wry remark, a digression
  stakes       why any of this matters
  other        none of these — then give `other_label`

`has_turn` — true when the paragraph goes somewhere the opening did not
promise: an expectation is set and then broken, or a thing turns out to have
done something other than what it was for. False when the paragraph states a
thing, says who made it, and says what it did, without surprise.

`what_turns` — in one clause, what the turn actually is. Write "nothing"
when there is none.

Be strict about `has_turn`. A paragraph that merely contains new information
is not turning; it is informing. The test is whether a reader's expectation
is set up and then violated."""


def build_client() -> genai.Client:
    key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY") or ""
    if not key.strip():
        raise SystemExit("GEMINI_API_KEY is not set")
    return genai.Client(api_key=key.strip())


def call(client: genai.Client, model: str, prompt: str) -> dict:
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
    raise SystemExit(f"Gemini failed after retries: {last}")


def run(client, model, label: str, paragraphs: list[str], window: int) -> dict:
    out: list[dict] = []
    for start in range(0, len(paragraphs), window):
        chunk = list(enumerate(paragraphs, start=1))[start : start + window]
        body = "\n\n".join(f"[{i}] {t}" for i, t in chunk)
        result = call(
            client,
            model,
            f"{INSTRUCTIONS}\n\nSOURCE: {label}\n\nPARAGRAPHS:\n{body}",
        )
        valid = {i for i, _ in chunk}
        out.extend(p for p in result.get("paragraphs", []) if p["index"] in valid)
        print(f"  {label} {chunk[0][0]}-{chunk[-1][0]}", flush=True)
    return {"label": label, "paragraphs": out}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--episode", type=int, nargs="*")
    ap.add_argument("--draft", type=str)
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--window", type=int, default=5)
    args = ap.parse_args()

    client = build_client()
    OUT.mkdir(parents=True, exist_ok=True)

    if args.draft:
        path = Path(args.draft)
        blocks = path.read_text(encoding="utf8").split("\n### ")[1:]
        paras = [
            b.split("\n", 1)[1].strip() for b in blocks if len(b.split()) > 40
        ]
        data = run(client, args.model, path.stem, paras, args.window)
        (OUT / f"draft-{path.stem}.json").write_text(
            json.dumps(data, indent=1), encoding="utf8"
        )
        return

    for ep in ALL_EPISODES:
        tp = TRANSCRIPTS / f"ep{ep.number:02d}-{ep.video_id}.en.json3"
        if not tp.exists():
            continue
        if args.episode and ep.number not in args.episode:
            continue
        dest = OUT / f"ep{ep.number:02d}.json"
        if dest.exists():
            print(f"ep{ep.number:02d}: already measured")
            continue
        paras = [p.text for p in by_pause(load_cues(tp)).paragraphs]
        data = run(client, args.model, f"ep{ep.number:02d}", paras, args.window)
        data["series"] = ep.series
        dest.write_text(json.dumps(data, indent=1), encoding="utf8")


if __name__ == "__main__":
    main()
