"""Fetch transcripts, and optionally low-resolution video, for the corpus.

    python fetch.py                    # captions for all four episodes
    python fetch.py --video 1          # also pull episode 1's video for scene work

Captions come as json3, which carries per-cue start and duration in
milliseconds — segmentation needs to know where speech actually stops, and
that arithmetic is easier on integers than on vtt timestamp strings.

These episodes carry human-authored subtitles ("en"), not just ASR
("en-en"), so we ask for the real ones and only fall back to the machine
transcript. Two things are needed to see them at all: a JavaScript runtime
(node satisfies yt-dlp's EJS requirement — without one the extractor falls
back to clients that expose no subtitle tracks), and --ignore-no-formats-error,
since format selection otherwise fails before subtitles are ever fetched.

Video is fetched at the lowest resolution that still yields usable frame
differences, since scene detection reads luminance changes and does not care
about detail. Nothing here is redistributed; corpus/ is gitignored.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from episodes import ALL_EPISODES, Episode

ROOT = Path(__file__).parent
TRANSCRIPTS = ROOT / "corpus" / "transcripts"
VIDEO = ROOT / "corpus" / "video"
WATCH = "https://www.youtube.com/watch?v="


BASE = ["yt-dlp", "--no-update", "--js-runtimes", "node", "--ignore-no-formats-error"]


def run(args: list[str]) -> str:
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode != 0:
        sys.stderr.write(result.stdout[-2000:] + result.stderr[-2000:])
        raise SystemExit(f"yt-dlp failed ({result.returncode})")
    return result.stdout


# Track naming is per-upload, not per-platform: one episode exposes ASR as
# "en-en", another as "en-orig" plus a translated "en". So ask each video
# what it has rather than assuming, and prefer authored subtitles to ASR —
# a human transcript segments far more honestly than a machine one.
AUTO_PREFERENCE = ("en-orig", "en", "en-en")


def choose_track(video_id: str) -> tuple[str, str, str] | None:
    """Returns (flag, lang, kind) for the best English track, or None."""
    meta = json.loads(run(BASE + ["-J", "--skip-download", WATCH + video_id]))
    authored = meta.get("subtitles") or {}
    if "en" in authored:
        return ("--write-subs", "en", "authored")
    auto = meta.get("automatic_captions") or {}
    for lang in AUTO_PREFERENCE:
        if lang in auto:
            return ("--write-auto-subs", lang, f"ASR/{lang}")
    return None


def fetch_captions(ep: Episode) -> Path | None:
    target = TRANSCRIPTS / f"ep{ep.number:02d}-{ep.video_id}"
    final = target.with_suffix(".en.json3")
    if final.exists():
        print(f"ep{ep.number:02d} captions: already present")
        return final

    track = choose_track(ep.video_id)
    if track is None:
        print(f"ep{ep.number:02d} captions: NONE AVAILABLE — {ep.title}", flush=True)
        return None

    flag, lang, kind = track
    print(f"ep{ep.number:02d} captions ({kind}): {ep.title}", flush=True)
    run(
        BASE
        + [
            "--skip-download",
            flag,
            "--sub-langs",
            lang,
            "--sub-format",
            "json3",
            "-o",
            str(target),
            WATCH + ep.video_id,
        ]
    )
    produced = target.with_suffix(f".{lang}.json3")
    if not produced.exists():
        raise SystemExit(f"Expected {produced} after download; it is missing")
    if produced != final:
        produced.rename(final)
    (TRANSCRIPTS / f"ep{ep.number:02d}-{ep.video_id}.source.txt").write_text(
        f"{kind}\n", encoding="utf8"
    )
    return final


def fetch_video(ep: Episode) -> Path:
    final = VIDEO / f"ep{ep.number:02d}-{ep.video_id}.mp4"
    if final.exists():
        print(f"ep{ep.number:02d} video: already present")
        return final
    print(f"ep{ep.number:02d} video: {ep.title} (lowest usable resolution)", flush=True)
    run(
        BASE
        + [
            # 18 is the muxed 360p progressive stream: one file, no merge, and
            # it downloads where some adaptive video-only formats answer 403.
            # Shot detection reads luminance change, so 540x360 is ample.
            "-f",
            "18/worst[height>=240]/worst",
            "--merge-output-format",
            "mp4",
            "-o",
            str(final),
            WATCH + ep.video_id,
        ]
    )
    if not final.exists():
        raise SystemExit(f"Expected {final} after download; it is missing")
    return final


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--video",
        type=int,
        nargs="*",
        metavar="EP",
        help="Episode numbers whose video to fetch as well (e.g. --video 1 2).",
    )
    parser.add_argument("--episode", type=int, nargs="*", metavar="EP")
    args = parser.parse_args()

    TRANSCRIPTS.mkdir(parents=True, exist_ok=True)
    VIDEO.mkdir(parents=True, exist_ok=True)

    wanted = args.episode or [e.number for e in ALL_EPISODES]
    missing: list[Episode] = []
    for ep in ALL_EPISODES:
        if ep.number in wanted and fetch_captions(ep) is None:
            missing.append(ep)
    for ep in ALL_EPISODES:
        if args.video and ep.number in args.video:
            fetch_video(ep)

    if missing:
        print("\nNo captions on this upload for:")
        for ep in missing:
            print(f"  ep{ep.number:02d} {ep.title} ({ep.video_id})")
        print("These episodes are excluded from the corpus until a captioned")
        print("source or a local transcription is supplied.")


if __name__ == "__main__":
    main()
