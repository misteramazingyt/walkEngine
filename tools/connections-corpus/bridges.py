"""What carries a reader across a topic change in Burke — measured.

    python bridges.py                 # all fetched episodes
    python bridges.py --episode 1 3

The first attempt at this failed and was never redone. The paragraph
categorizer produced a 136x136 transition matrix with 133 non-zero cells,
every count exactly 1: its states were free-text prose, unique per
paragraph, so nothing recurred and nothing generalised. Every rule about
bridges in this project has therefore been hand-authored, including the
prohibition list in the incipit prompt.

This measures the thing directly. Adjacent paragraph pairs go to the model
with a CLOSED vocabulary of bridge kinds — the lesson of the first failure —
plus an `other` escape with a free label. If `other` dominates, the
vocabulary is wrong and the finding is that, not a tidy distribution.

The question that prompted it: is a figure of resemblance ("the meaning of
life, once etched in stone, now soared into the heavens") a bridge Burke
actually uses, or an invention of ours filling the place where a carried
subject should be?
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

from episodes import ALL_EPISODES, Episode
from segment import by_pause
from transcript import load_cues

ROOT = Path(__file__).parent
TRANSCRIPTS = ROOT / "corpus" / "transcripts"
BRIDGES = ROOT / "corpus" / "bridges"
FINDINGS = ROOT / "findings"
DEFAULT_MODEL = "gemini-2.5-flash"

BRIDGE_KINDS = [
    "carried_subject",
    "consequence",
    "problem_raised",
    "instrument_needed",
    "contrast",
    "resemblance",
    "question_posed",
    "return_to_earlier",
    "hard_cut",
    "other",
]

SCHEMA = {
    "type": "object",
    "properties": {
        "transitions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "from_index": {"type": "integer"},
                    "to_index": {"type": "integer"},
                    "topic_changed": {"type": "boolean"},
                    "bridge_text": {"type": "string"},
                    "bridge_kind": {"type": "string", "enum": BRIDGE_KINDS},
                    "other_label": {"type": "string"},
                    "carries_over": {"type": "string"},
                },
                "required": [
                    "from_index",
                    "to_index",
                    "topic_changed",
                    "bridge_text",
                    "bridge_kind",
                    "carries_over",
                ],
                "additionalProperties": False,
            },
        }
    },
    "required": ["transitions"],
    "additionalProperties": False,
}

INSTRUCTIONS = """You are measuring how a television documentary moves from
one paragraph to the next.

For EVERY adjacent pair of paragraphs given, report one transition.

`topic_changed` — true when the second paragraph is about something
different from the first. False when it continues the same subject.

`bridge_text` — quote, VERBATIM from the transcript, the clause or sentence
that actually carries the reader across. Usually the last sentence of the
first paragraph or the first of the second. If nothing does, quote the
opening words of the second paragraph and mark the kind `hard_cut`.

`bridge_kind` — choose exactly one:

  carried_subject     something already under discussion is still being
                      discussed; the move needs no handoff because a subject
                      persists across the seam
  consequence         the second follows from what the first produced,
                      enabled, or set in motion
  problem_raised      the first leaves a difficulty, lack, or question, and
                      the second takes it up
  instrument_needed   the second supplies a means, tool, material, or
                      technique the first has just shown to be required
  contrast            the second is set against the first — a different
                      place, class, era, or choice
  resemblance         the two are joined because they are ALIKE: a
                      metaphor, an echo, a figure, a "just as X, so Y".
                      Likeness asserted in place of a connection
  question_posed      an explicit question is asked and then pursued
  return_to_earlier   the programme comes back to something dropped earlier
  hard_cut            no bridge at all; the new subject simply begins
  other               none of these fit — then give `other_label`

Be strict about `resemblance`: use it only when likeness is the ONLY thing
joining the two. If the second genuinely follows from the first, it is a
consequence even if the sentence is figurative.

`carries_over` — name what persists across the seam: a subject, an object, a
person, a problem. Write "nothing" when nothing does.

Report on the pairs given and no others. Use the indices as printed."""


def build_client() -> genai.Client:
    key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY") or ""
    if not key.strip():
        raise SystemExit("GEMINI_API_KEY is not set")
    return genai.Client(api_key=key.strip())


def call(client: genai.Client, model: str, prompt: str) -> dict:
    last: Exception | None = None
    for attempt in range(4):
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_json_schema=SCHEMA,
                    temperature=0.1,
                    max_output_tokens=32000,
                ),
            )
            text = (response.text or "").strip()
            if not text:
                raise RuntimeError("empty response")
            return json.loads(text)
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(2 * (attempt + 1))
    raise SystemExit(f"Gemini failed after retries: {last}")


def measure(client: genai.Client, model: str, ep: Episode, window: int) -> dict:
    path = TRANSCRIPTS / f"ep{ep.number:02d}-{ep.video_id}.en.json3"
    seg = by_pause(load_cues(path))
    paragraphs = seg.paragraphs
    transitions: list[dict] = []

    # Overlap by one so every adjacent pair is covered exactly once.
    start = 0
    while start < len(paragraphs) - 1:
        chunk = paragraphs[start : start + window]
        body = "\n\n".join(f"[{p.index}] {p.text}" for p in chunk)
        pairs = ", ".join(
            f"{a.index}->{b.index}" for a, b in zip(chunk, chunk[1:])
        )
        prompt = (
            f"{INSTRUCTIONS}\n\n"
            f"PROGRAMME: James Burke, {ep.series} — “{ep.title}”\n\n"
            f"PAIRS TO REPORT: {pairs}\n\n"
            f"PARAGRAPHS:\n{body}"
        )
        result = call(client, model, prompt)
        valid = {p.index for p in chunk}
        for t in result.get("transitions", []):
            if t["from_index"] in valid and t["to_index"] in valid:
                transitions.append(t)
        print(
            f"  ep{ep.number:02d} {chunk[0].index}-{chunk[-1].index}: "
            f"{len(result.get('transitions', []))} transitions",
            flush=True,
        )
        start += window - 1

    # A pair can be reported twice where windows overlap; keep the first.
    seen: set[tuple[int, int]] = set()
    unique = []
    for t in transitions:
        key = (t["from_index"], t["to_index"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(t)

    return {
        "episode": ep.number,
        "title": ep.title,
        "series": ep.series,
        "paragraphs": len(paragraphs),
        "transitions": unique,
    }


def measure_draft(client: genai.Client, model: str, path: Path, window: int) -> dict:
    """The instrument, turned on our own writing.

    It does not care where paragraphs came from, which is the point of
    having measured Burke at all: the same closed vocabulary applied to a
    generated script says where the two differ without anyone judging
    whether the prose feels right.
    """
    text = path.read_text(encoding="utf8")
    # Split on the beat headings the writer emits; a plain split avoids a
    # regex whose escapes have to survive being written by another script.
    blocks = text.split("\n### ")[1:]
    paragraphs = [
        b.split("\n", 1)[1].strip() for b in blocks if len(b.split()) > 40
    ]
    transitions: list[dict] = []
    numbered = list(enumerate(paragraphs, start=1))

    start = 0
    while start < len(numbered) - 1:
        chunk = numbered[start : start + window]
        body = "\n\n".join(f"[{i}] {t}" for i, t in chunk)
        pairs = ", ".join(f"{a[0]}->{b[0]}" for a, b in zip(chunk, chunk[1:]))
        prompt = (
            f"{INSTRUCTIONS}\n\n"
            "PROGRAMME: a generated script under evaluation\n\n"
            f"PAIRS TO REPORT: {pairs}\n\n"
            f"PARAGRAPHS:\n{body}"
        )
        result = call(client, model, prompt)
        valid = {i for i, _ in chunk}
        for t in result.get("transitions", []):
            if t["from_index"] in valid and t["to_index"] in valid:
                transitions.append(t)
        print(f"  draft {chunk[0][0]}-{chunk[-1][0]}", flush=True)
        start += window - 1

    seen: set[tuple[int, int]] = set()
    unique = []
    for t in transitions:
        key = (t["from_index"], t["to_index"])
        if key not in seen:
            seen.add(key)
            unique.append(t)
    return {
        "episode": 0,
        "title": path.stem,
        "series": "DRAFT",
        "paragraphs": len(paragraphs),
        "transitions": unique,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--episode", type=int, nargs="*")
    parser.add_argument(
        "--draft",
        type=str,
        help="Score a generated draft with the same instrument, for comparison.",
    )
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--window", type=int, default=7)
    args = parser.parse_args()

    client = build_client()
    BRIDGES.mkdir(parents=True, exist_ok=True)

    # The instrument does not care where the paragraphs came from, so it can
    # be turned on our own writing. That comparison is the whole point of
    # having measured Burke at all.
    if args.draft:
        data = measure_draft(client, args.model, Path(args.draft), args.window)
        out = BRIDGES / f"draft-{Path(args.draft).stem}.json"
        out.write_text(json.dumps(data, indent=1), encoding="utf8")
        print(f"  -> {len(data['transitions'])} transitions in {out.name}")
        return

    available = [
        e
        for e in ALL_EPISODES
        if (TRANSCRIPTS / f"ep{e.number:02d}-{e.video_id}.en.json3").exists()
        and (args.episode is None or e.number in args.episode)
    ]
    print(f"{len(available)} episodes with transcripts\n")

    for ep in available:
        out = BRIDGES / f"ep{ep.number:02d}.json"
        if out.exists():
            print(f"ep{ep.number:02d}: already measured")
            continue
        print(f"ep{ep.number:02d} {ep.title}", flush=True)
        data = measure(client, args.model, ep, args.window)
        out.write_text(json.dumps(data, indent=1), encoding="utf8")
        print(f"  -> {len(data['transitions'])} transitions\n", flush=True)


if __name__ == "__main__":
    main()
