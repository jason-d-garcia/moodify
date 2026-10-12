"""Build the illustrative demo catalog (src/data/catalog.json).

These probabilities are NOT model output. They are hand-picked quadrant
guesses with seeded Dirichlet noise so the UI has something realistic to
show until score_catalog.py is run with a real BERT checkpoint.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

LABELS = ["happy", "sad", "angry", "relaxed"]  # same order as dataset.LABEL_MAP

SONGS = {
    "happy": [
        ("Happy", "Pharrell Williams"), ("Uptown Funk", "Mark Ronson, Bruno Mars"),
        ("Walking on Sunshine", "Katrina and the Waves"), ("Can't Stop the Feeling!", "Justin Timberlake"),
        ("Shake It Off", "Taylor Swift"), ("Good as Hell", "Lizzo"),
        ("Mr. Blue Sky", "Electric Light Orchestra"), ("Dancing Queen", "ABBA"),
        ("Don't Stop Me Now", "Queen"), ("September", "Earth, Wind & Fire"),
        ("Hey Ya!", "OutKast"), ("I Gotta Feeling", "The Black Eyed Peas"),
    ],
    "angry": [
        ("Killing in the Name", "Rage Against the Machine"), ("Break Stuff", "Limp Bizkit"),
        ("Bodies", "Drowning Pool"), ("Given Up", "Linkin Park"),
        ("Smells Like Teen Spirit", "Nirvana"), ("Before I Forget", "Slipknot"),
        ("Chop Suey!", "System Of A Down"), ("You Oughta Know", "Alanis Morissette"),
        ("Down with the Sickness", "Disturbed"), ("Bulls on Parade", "Rage Against the Machine"),
        ("Misery Business", "Paramore"), ("Platypus (I Hate You)", "Green Day"),
    ],
    "sad": [
        ("Someone Like You", "Adele"), ("Hurt", "Johnny Cash"),
        ("Everybody Hurts", "R.E.M."), ("Tears in Heaven", "Eric Clapton"),
        ("Fix You", "Coldplay"), ("The Night We Met", "Lord Huron"),
        ("Skinny Love", "Bon Iver"), ("Mad World", "Gary Jules"),
        ("Liability", "Lorde"), ("Nothing Compares 2 U", "Sinéad O'Connor"),
        ("Yesterday", "The Beatles"), ("drivers license", "Olivia Rodrigo"),
    ],
    "relaxed": [
        ("Banana Pancakes", "Jack Johnson"), ("Three Little Birds", "Bob Marley & The Wailers"),
        ("Here Comes the Sun", "The Beatles"), ("Sunday Morning", "Maroon 5"),
        ("Better Together", "Jack Johnson"), ("Riptide", "Vance Joy"),
        ("Island in the Sun", "Weezer"), ("Put Your Records On", "Corinne Bailey Rae"),
        ("Lovely Day", "Bill Withers"), ("What a Wonderful World", "Louis Armstrong"),
        ("Budapest", "George Ezra"), ("Bubbly", "Colbie Caillat"),
    ],
}

# A few songs whose lyrics plausibly straddle two quadrants.
MIXED = [
    ("Dancing On My Own", "Robyn", {"sad": 4, "happy": 3}),
    ("Hey Jude", "The Beatles", {"sad": 3, "relaxed": 3}),
    ("Mr. Brightside", "The Killers", {"angry": 3, "sad": 2, "happy": 2}),
    ("Rolling in the Deep", "Adele", {"angry": 4, "sad": 3}),
    ("Pumped Up Kicks", "Foster the People", {"happy": 3, "angry": 3}),
    ("Hallelujah", "Jeff Buckley", {"sad": 3, "relaxed": 3}),
]


def dirichlet(rng: random.Random, alpha: dict[str, float]) -> dict[str, float]:
    draws = {k: rng.gammavariate(alpha.get(k, 0.6), 1.0) for k in LABELS}
    total = sum(draws.values())
    return {k: round(v / total, 4) for k, v in draws.items()}


def main() -> None:
    rng = random.Random(7)
    songs = []
    for mood, items in SONGS.items():
        for title, artist in items:
            strength = rng.uniform(4, 12)
            songs.append({"title": title, "artist": artist,
                          "probs": dirichlet(rng, {mood: strength})})
    for title, artist, alpha in MIXED:
        songs.append({"title": title, "artist": artist, "probs": dirichlet(rng, alpha)})

    out = {
        "source": "illustrative",
        "note": "Hand-assigned placeholder probabilities, not BERT output.",
        "labels": LABELS,
        "songs": songs,
    }
    path = Path(__file__).resolve().parent.parent / "src" / "data" / "catalog.json"
    path.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {len(songs)} songs -> {path}")


if __name__ == "__main__":
    main()
