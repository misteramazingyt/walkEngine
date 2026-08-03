"""Surface measurements, and the same ruler held to our own drafts.

    python surface.py --draft ../../drafts/meaning-you-make.md

Every instrument built so far has been pointed at Burke. Pointed at our own
output they become a scorecard, and the gaps are visible without anyone
having to judge whether the prose "feels right".

Nothing here calls a model. These are counts: specificity, sentence rhythm,
who is addressed, how often a question is asked. They are the features a
reader registers before noticing structure at all.
"""

from __future__ import annotations

import argparse
import re
import statistics
from pathlib import Path

from episodes import ALL_EPISODES
from segment import by_pause
from transcript import load_cues

ROOT = Path(__file__).parent
TRANSCRIPTS = ROOT / "corpus" / "transcripts"

YEAR = re.compile(r"\b(?:1[0-9]{3}|20[0-2][0-9]|[1-9][0-9]{0,2}\s?(?:BCE?|AD))\b")
NUMBER = re.compile(r"\b\d[\d,\.]*\b")
PROPER = re.compile(r"\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*")
SECOND = re.compile(r"\b(you|your|you're|you've|yourself)\b", re.I)
FIRST = re.compile(r"\b(I|we|our|us|my)\b")
SENTENCE = re.compile(r"[.!?]+(?:\s|$)")


def measure(paragraphs: list[str], label: str) -> dict:
    words_total = 0
    sent_lengths: list[int] = []
    per_para_words: list[int] = []
    years = numbers = propers = second = first = questions = 0

    for text in paragraphs:
        words = text.split()
        words_total += len(words)
        per_para_words.append(len(words))
        sentences = [s for s in SENTENCE.split(text) if s.strip()]
        sent_lengths.extend(len(s.split()) for s in sentences)
        years += len(YEAR.findall(text))
        numbers += len(NUMBER.findall(text))
        # Sentence-initial capitals inflate proper-noun counts; skip the
        # first word of each sentence so the measure tracks names, not syntax.
        body = " ".join(s.split(" ", 1)[1] if " " in s else "" for s in sentences)
        propers += len(PROPER.findall(body))
        second += len(SECOND.findall(text))
        first += len(FIRST.findall(text))
        questions += text.count("?")

    per100 = lambda n: round(100 * n / max(1, words_total), 2)  # noqa: E731
    return {
        "label": label,
        "paragraphs": len(paragraphs),
        "words": words_total,
        "median_words_per_paragraph": round(statistics.median(per_para_words), 1),
        "median_sentence_words": round(statistics.median(sent_lengths), 1),
        "mean_sentence_words": round(statistics.mean(sent_lengths), 1),
        "long_sentences_pct": round(
            100 * sum(1 for s in sent_lengths if s > 35) / max(1, len(sent_lengths)), 1
        ),
        "years_per_100w": per100(years),
        "numbers_per_100w": per100(numbers),
        "proper_nouns_per_100w": per100(propers),
        "second_person_per_100w": per100(second),
        "first_person_per_100w": per100(first),
        "questions_per_paragraph": round(questions / max(1, len(paragraphs)), 2),
    }


def burke_paragraphs() -> list[str]:
    out: list[str] = []
    for ep in ALL_EPISODES:
        path = TRANSCRIPTS / f"ep{ep.number:02d}-{ep.video_id}.en.json3"
        if not path.exists():
            continue
        out.extend(p.text for p in by_pause(load_cues(path)).paragraphs)
    return out


def draft_paragraphs(path: Path) -> list[str]:
    text = path.read_text(encoding="utf8")
    blocks = re.split(r"\n### \d+\. [^\n]*\n", text)[1:]
    return [b.strip() for b in blocks if len(b.split()) > 40]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--draft", type=str, action="append", default=[])
    args = parser.parse_args()

    rows = [measure(burke_paragraphs(), "Burke (all fetched episodes)")]
    for d in args.draft:
        path = Path(d)
        rows.append(measure(draft_paragraphs(path), path.stem))

    keys = [k for k in rows[0] if k != "label"]
    width = max(len(k) for k in keys) + 2
    header = "".ljust(width) + "".join(r["label"][:26].rjust(28) for r in rows)
    print(header)
    print("-" * len(header))
    for key in keys:
        line = key.ljust(width)
        for r in rows:
            line += str(r[key]).rjust(28)
        print(line)


if __name__ == "__main__":
    main()
