"""Write pause-segmented episodes as .txt for the paragraph formalism tool.

    python export_for_categorizer.py

The categorizer at 202604281241 - generativeCategorization/paragraphSystem
already accepts `--ext txt`, discovers files by glob, and splits paragraphs
on blank lines — and its clean_text collapses runs of newlines to exactly
two rather than removing them. So a blank-line-separated text file passes
our segmentation through untouched, and that project needs no modification
to read this corpus. Nothing is imported from it and nothing is patched.

Output goes to corpus/for-categorizer/, gitignored like the rest of the
material: these files are the transcript, rearranged.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from episodes import CONNECTIONS_1
from segment import by_pause
from transcript import load_cues

ROOT = Path(__file__).parent
TRANSCRIPTS = ROOT / "corpus" / "transcripts"
OUT = ROOT / "corpus" / "for-categorizer"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--min-words", type=int, default=40)
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []

    for ep in CONNECTIONS_1:
        transcript = TRANSCRIPTS / f"ep{ep.number:02d}-{ep.video_id}.en.json3"
        if not transcript.exists():
            print(f"ep{ep.number:02d}: no transcript, skipped")
            continue

        seg = by_pause(load_cues(transcript), min_words=args.min_words)
        # A blank line between paragraphs is the entire interface.
        body = "\n\n".join(p.text for p in seg.paragraphs)
        name = f"connections-ep{ep.number:02d}-{ep.title.lower().replace(' ', '-')}.txt"
        (OUT / name).write_text(body, encoding="utf8")

        stats = seg.stats()
        manifest.append({"episode": ep.number, "title": ep.title, "file": name, **stats})
        print(
            f"ep{ep.number:02d} {ep.title}: {stats['paragraphs']} paragraphs, "
            f"median {stats['median_words']}w / {stats['median_seconds']}s"
        )

    # Timings are dropped by the .txt handoff, so keep the index that lets a
    # categorized paragraph be traced back to its minute of the episode.
    (OUT / "_manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf8")
    for ep_entry in manifest:
        number = ep_entry["episode"]
        ep = next(e for e in CONNECTIONS_1 if e.number == number)
        seg = by_pause(
            load_cues(TRANSCRIPTS / f"ep{number:02d}-{ep.video_id}.en.json3"),
            min_words=args.min_words,
        )
        (OUT / f"_timings-ep{number:02d}.json").write_text(
            json.dumps(
                [
                    {
                        "paragraph_index_1based": p.index,
                        "start_s": round(p.start_s, 2),
                        "end_s": round(p.end_s, 2),
                        "word_count": p.word_count,
                        "boundary_reason": p.boundary_reason,
                    }
                    for p in seg.paragraphs
                ],
                indent=1,
            ),
            encoding="utf8",
        )

    print(f"\nwrote {len(manifest)} files to {OUT}")
    print("\nRun the categorizer over them with:")
    print(
        '  cd "/h/My Drive/Projects/00 Now/06 Writing/.working/'
        '202604281241 - generativeCategorization/paragraphSystem"'
    )
    print(f'  python paragraph_formalism.py --ext txt --input "{OUT}"')


if __name__ == "__main__":
    main()
