"""Rebuild the MoodyLyrics training CSV (Lyrics, Mood) that train.py expects.

MoodyLyrics ships song labels without lyrics. This joins its label file with
lyrics fetched from Genius. Output stays local: lyrics are copyrighted and
must not be committed or published.

    pip install lyricsgenius pandas openpyxl
    export GENIUS_ACCESS_TOKEN=...   # https://genius.com/api-clients
    python scripts/build_lyrics_dataset.py --labels ml_balanced.xlsx --out lyrics.csv
"""
from __future__ import annotations

import argparse
import os
import time
from pathlib import Path

import pandas as pd


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--labels", type=Path, required=True, help="MoodyLyrics ml_balanced.xlsx or ml_raw.xlsx")
    parser.add_argument("--out", type=Path, default=Path("lyrics.csv"))
    parser.add_argument("--sleep", type=float, default=0.5, help="seconds between Genius requests")
    args = parser.parse_args()

    import lyricsgenius

    genius = lyricsgenius.Genius(os.environ["GENIUS_ACCESS_TOKEN"], timeout=15, retries=2,
                                 remove_section_headers=True, verbose=False)

    labels = pd.read_excel(args.labels)
    labels.columns = [c.strip().lower() for c in labels.columns]

    # Resume support: skip songs already fetched in a previous run.
    done = pd.read_csv(args.out) if args.out.exists() else pd.DataFrame(columns=["Artist", "Title", "Lyrics", "Mood"])
    seen = set(zip(done["Artist"], done["Title"]))

    rows = done.to_dict("records")
    for _, r in labels.iterrows():
        key = (r["artist"], r["title"])
        if key in seen:
            continue
        try:
            song = genius.search_song(r["title"], r["artist"])
            lyrics = song.lyrics if song else "Lyrics not found"
        except Exception as exc:  # network hiccup; leave it for the next run
            print(f"skip {key}: {exc}")
            continue
        rows.append({"Artist": r["artist"], "Title": r["title"], "Lyrics": lyrics, "Mood": str(r["mood"]).lower()})
        if len(rows) % 50 == 0:
            pd.DataFrame(rows).to_csv(args.out, index=False)
            print(f"{len(rows)} songs")
        time.sleep(args.sleep)

    pd.DataFrame(rows).to_csv(args.out, index=False)
    found = sum(r["Lyrics"] != "Lyrics not found" for r in rows)
    print(f"wrote {len(rows)} songs ({found} with lyrics) -> {args.out}")


if __name__ == "__main__":
    main()
