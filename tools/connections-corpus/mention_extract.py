"""Extract subject MENTIONS per paragraph with Gemini, and resolve them.

    python mention_extract.py --episode 1
    python mention_extract.py                    # all available episodes

Unigrams cannot see that "the plough", "it", and "this new device" are one
subject, and they cannot tell a subject being introduced in passing from a
subject the paragraph is about. Both distinctions are the whole question, so
extraction is done by a model that reads.

Paragraphs are sent in chunks with a running REGISTRY of subjects already
found, and the model is told to reuse an existing id whenever a paragraph
refers to something already registered. Coreference therefore accumulates
across the episode instead of being re-guessed per paragraph, at the cost of
a sequential run: chunk N+1 cannot start until chunk N has returned.

Each mention records how it was made and what it was doing:

  mention_type  named | definite_description | indefinite_introduction
                | pronoun | metonym | allusion
  role          topic | elaborated | supporting | passing | planted

`planted` is the one that matters most: a subject named in advance of the
passage that will develop it. Burke's transitions depend on it, and
BurkeCluster asserts it exists without ever measuring it.

Output goes to corpus/mentions/ — gitignored, since it quotes the surface
text of each mention.
"""

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

from google import genai
from google.genai import types

from episodes import CONNECTIONS_1
from segment import by_pause
from transcript import load_cues

ROOT = Path(__file__).parent
TRANSCRIPTS = ROOT / "corpus" / "transcripts"
MENTIONS = ROOT / "corpus" / "mentions"

DEFAULT_MODEL = "gemini-2.5-flash"

SCHEMA = {
    "type": "object",
    "properties": {
        "new_subjects": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "label": {"type": "string"},
                    "kind": {
                        "type": "string",
                        "enum": [
                            "artifact", "practice", "institution", "person",
                            "place", "event", "process", "concept", "group",
                        ],
                    },
                },
                "required": ["id", "label", "kind"],
                "additionalProperties": False,
            },
        },
        "mentions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "paragraph_index": {"type": "integer"},
                    "subject_id": {"type": "string"},
                    "surface": {"type": "string"},
                    "mention_type": {
                        "type": "string",
                        "enum": [
                            "named", "definite_description",
                            "indefinite_introduction", "pronoun",
                            "metonym", "allusion",
                        ],
                    },
                    "role": {
                        "type": "string",
                        "enum": ["topic", "elaborated", "supporting", "passing", "planted"],
                    },
                },
                "required": [
                    "paragraph_index", "subject_id", "surface",
                    "mention_type", "role",
                ],
                "additionalProperties": False,
            },
        },
    },
    "required": ["new_subjects", "mentions"],
    "additionalProperties": False,
}

INSTRUCTIONS = """You are tracking SUBJECTS through a television documentary
transcript, one chunk of paragraphs at a time.

A subject is something the programme can be about: an artifact, a practice,
an institution, a person, a place, an event, a process, a group. Not a theme
and not a mood. Prefer the specific to the abstract — "the water-driven
trip hammer" over "technology", "the Cistercian order" over "religion".

For every paragraph, record EVERY mention of every subject that is either
already in the registry or worth registering because it will plausibly
recur. Ignore words that name nothing in particular.

Reuse a registry id whenever the paragraph refers to something already
registered, however it is worded — "the plough", "it", "this new device"
and "the heavy plough" are one subject if they refer to one thing. Register
a new subject only when nothing in the registry fits.

mention_type — how the mention is made:
  named                     a proper or standard name is used
  definite_description      "the heavy plough", "the new device"
  indefinite_introduction   "a kind of plough", first presentation
  pronoun                   it, they, this, these
  metonym                   the part, the material, or the place standing in
  allusion                  referred to without being named at all

role — what the mention is doing in THAT paragraph:
  topic       the paragraph is about this subject
  elaborated  developed at length though not the sole topic
  supporting  used to explain something else
  passing     mentioned once, incidentally
  planted     introduced or gestured at here, but plainly to be taken up
              later — named before it matters

Be strict about `planted`: use it only when the paragraph raises something
it does not then develop. That distinction is the point of the exercise.

Return only paragraphs from the chunk you were given, using the paragraph
indices as printed."""


def build_client() -> genai.Client:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise SystemExit("GEMINI_API_KEY is not set")
    return genai.Client(api_key=key)


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
                ),
            )
            text = (response.text or "").strip()
            if not text:
                raise RuntimeError("empty response")
            return json.loads(text)
        except Exception as exc:  # noqa: BLE001 - retried, then surfaced
            last = exc
            time.sleep(2 * (attempt + 1))
    raise SystemExit(f"Gemini failed after retries: {last}")


def registry_block(subjects: dict[str, dict]) -> str:
    if not subjects:
        return "(empty — this is the first chunk)"
    return "\n".join(
        f"  {s['id']} | {s['label']} ({s['kind']})" for s in subjects.values()
    )


def extract_episode(client: genai.Client, model: str, number: int, chunk: int) -> dict:
    ep = next(e for e in CONNECTIONS_1 if e.number == number)
    path = TRANSCRIPTS / f"ep{number:02d}-{ep.video_id}.en.json3"
    seg = by_pause(load_cues(path))
    paragraphs = seg.paragraphs

    subjects: dict[str, dict] = {}
    mentions: list[dict] = []

    for start in range(0, len(paragraphs), chunk):
        window = paragraphs[start : start + chunk]
        body = "\n\n".join(f"[{p.index}] {p.text}" for p in window)
        prompt = (
            f"{INSTRUCTIONS}\n\n"
            f"PROGRAMME: Connections (1978), episode {ep.number}, “{ep.title}”\n\n"
            f"REGISTRY OF SUBJECTS ALREADY FOUND:\n{registry_block(subjects)}\n\n"
            f"PARAGRAPHS {window[0].index}–{window[-1].index}:\n{body}"
        )
        result = call(client, model, prompt)

        for s in result.get("new_subjects", []):
            if s["id"] not in subjects:
                subjects[s["id"]] = s
        valid_indices = {p.index for p in window}
        for m in result.get("mentions", []):
            if m["paragraph_index"] not in valid_indices:
                continue
            if m["subject_id"] not in subjects:
                # A mention of an unregistered subject is unusable: it cannot
                # be joined to a trajectory. Drop it rather than invent one.
                continue
            mentions.append(m)
        print(
            f"  ep{number:02d} paragraphs {window[0].index}-{window[-1].index}: "
            f"{len(result.get('mentions', []))} mentions, "
            f"registry now {len(subjects)}",
            flush=True,
        )

    return {
        "episode": number,
        "title": ep.title,
        "model": model,
        "paragraph_count": len(paragraphs),
        "subjects": list(subjects.values()),
        "mentions": mentions,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--episode", type=int, nargs="*")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--chunk", type=int, default=8)
    args = parser.parse_args()

    client = build_client()
    MENTIONS.mkdir(parents=True, exist_ok=True)

    wanted = args.episode or [
        e.number
        for e in CONNECTIONS_1
        if (TRANSCRIPTS / f"ep{e.number:02d}-{e.video_id}.en.json3").exists()
    ]
    for number in wanted:
        print(f"ep{number:02d}: extracting mentions with {args.model}", flush=True)
        data = extract_episode(client, args.model, number, args.chunk)
        out = MENTIONS / f"ep{number:02d}.json"
        out.write_text(json.dumps(data, indent=1), encoding="utf8")
        print(
            f"ep{number:02d}: {len(data['subjects'])} subjects, "
            f"{len(data['mentions'])} mentions -> {out.name}\n",
            flush=True,
        )


if __name__ == "__main__":
    main()
