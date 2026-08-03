"""The corpus under analysis: Connections series 1 (BBC, 1978).

Series 1 alone, deliberately. The playlist also carries Connections 3 (1997)
and two standalone documentaries, but pacing and format differ enough between
1978 and 1997 that pooling them would average away the very rhythm we are
trying to measure. Widening the corpus is a later decision, not a default.

Third-party material. Transcripts and video are fetched into corpus/, which
is gitignored; only derived measurements and findings are committed.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Episode:
    number: int
    video_id: str
    title: str
    duration_s: int


CONNECTIONS_1: list[Episode] = [
    Episode(1, "XetplHcM7aQ", "The Trigger Effect", 2962),
    Episode(2, "1NqRbBvujHY", "Death in the Morning", 2954),
    Episode(3, "eCp8h9RkaSw", "Distant Voices", 2962),
    Episode(4, "z6yL0_sDnX0", "Faith in Numbers", 2922),
]

BY_ID = {e.video_id: e for e in CONNECTIONS_1}


def episode(video_id: str) -> Episode:
    if video_id not in BY_ID:
        known = ", ".join(f"{e.video_id} (ep {e.number})" for e in CONNECTIONS_1)
        raise SystemExit(f"Unknown video id {video_id!r}. Known: {known}")
    return BY_ID[video_id]
