"""The corpus under analysis: James Burke, from the linked playlist.

Series 1 (1978) is the canonical form. Series 3 (1997) is the same author
nineteen years later, and the two standalone documentaries are a third
register again. They are kept labelled rather than pooled, so a measurement
that holds across all three is visibly stronger than one that holds in one.

The playlist's sixteenth item, a 72-second television clip, is not Burke and
is not here.

Third-party material. Transcripts are fetched into corpus/, which is
gitignored; only derived measurements and findings are committed.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Episode:
    number: int
    video_id: str
    title: str
    duration_s: int
    series: str


CONNECTIONS_1: list[Episode] = [
    Episode(1, "XetplHcM7aQ", "The Trigger Effect", 2962, "C1"),
    Episode(2, "1NqRbBvujHY", "Death in the Morning", 2954, "C1"),
    Episode(3, "eCp8h9RkaSw", "Distant Voices", 2962, "C1"),
    Episode(4, "z6yL0_sDnX0", "Faith in Numbers", 2922, "C1"),
]

CONNECTIONS_3: list[Episode] = [
    Episode(11, "0Clsw1LB3Ws", "Feedback", 3133, "C3"),
    Episode(12, "3RFAwRuccDs", "What's in a Name", 3119, "C3"),
    Episode(13, "I4CEQxXrXGY", "Drop the Apple", 3119, "C3"),
    Episode(14, "xtwK-FZVuMQ", "An Invisible Object", 3124, "C3"),
    Episode(15, "Pe_fOLdcqtE", "Life is No Picnic", 3125, "C3"),
    Episode(16, "-vPkBu5pLoA", "Elementary Stuff", 3124, "C3"),
    Episode(17, "8klGPY1CzwI", "A Special Place", 3125, "C3"),
    Episode(18, "eJMXgTNKBks", "Fire from the Sky", 3125, "C3"),
    Episode(19, "w4ujTt0gDx8", "In Touch", 3125, "C3"),
]

DOCUMENTARIES: list[Episode] = [
    Episode(31, "NTLBBV8zswA", "Spaceman!", 3862, "DOC"),
    Episode(32, "puWbQ1b-ljU", "The Other Side of the Moon", 3440, "DOC"),
]

ALL_EPISODES: list[Episode] = [*CONNECTIONS_1, *CONNECTIONS_3, *DOCUMENTARIES]
BY_ID = {e.video_id: e for e in ALL_EPISODES}
BY_NUMBER = {e.number: e for e in ALL_EPISODES}


def episode(video_id: str) -> Episode:
    if video_id not in BY_ID:
        raise SystemExit(f"Unknown video id {video_id!r}")
    return BY_ID[video_id]
