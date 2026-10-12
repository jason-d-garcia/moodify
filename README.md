# Moodify

Drag a point around a valence/arousal mood map and get songs that match, each with a
Spotify link. No login.

Song positions come from the four-class BERT lyrics classifier in
[bert-lyrics-sentiment-analysis](https://github.com/jason-d-garcia/bert-lyrics-sentiment-analysis)
(labels `happy=0, sad=1, angry=2, relaxed=3`, from `dataset.py`).

## The map

The map follows Russell's circumplex model of affect: valence (how pleasant, shown as
"Feels bad" to "Feels good") on the x axis and arousal (how activated, "Calm" to "Wired") on
the y axis. It is cut into the 16 emotion words from Feldman Barrett & Russell (1998), as
reproduced in Posner, Russell & Peterson (2005): four per quadrant, drawn as equal 22.5°
slices (the published figure is schematic, so the equal spacing is a simplification).

| Quadrant | Sections, counter-clockwise |
|---|---|
| Feels good + wired | Happy, Elated, Excited, Alert |
| Feels bad + wired | Tense, Nervous, Stressed, Upset |
| Feels bad + calm | Sad, Depressed, Lethargic, Fatigued |
| Feels good + calm | Calm, Relaxed, Serene, Contented |

Points within 0.2 of the centre are labelled *Mixed*. A song's emotion is the section its
position falls in.

## How songs are placed

Each MoodyLyrics class is one quadrant of Russell's circumplex
(Happy +V+A, Angry −V+A, Sad −V−A, Relaxed +V−A). A song sits at its expected quadrant
position:

```
valence = p(happy) + p(relaxed) − p(angry) − p(sad)
arousal = p(happy) + p(angry) − p(sad) − p(relaxed)
```

**Caveat:** these are not supervised valence/arousal estimates. A song the model is unsure
about lands near the centre, so "neutral" and "ambiguous" look the same. The UI fades
low-confidence songs and tags any song whose top class is under 50% as *uncertain*.

## Data

`src/data/catalog.json` holds the 141 **held-out test songs** from a retrained model
(bert-base-cased, max_len 160, 5 epochs, best checkpoint at epoch 3), with their MoodyLyrics
label in `true_mood`. Only test-split songs are shown, so the model never saw any of them in
training.

| Test split (141 songs) | Value |
|---|---|
| Accuracy | 125/141 (88.7%) |
| Macro F1 | 0.887 |
| NLL before / after temperature scaling | 0.595 / 0.395 |
| ECE (10 bins) before / after | 0.109 / 0.066 |

Training data: 2,000 MoodyLyrics songs with Genius lyrics, cleaned to 1,872 (empty or
missing lyrics, non-lyrics pages, wrong-song matches and duplicates removed), split
1,591 / 140 / 141 with seed 42.

The raw softmax was overconfident (mean top-class probability 0.98), so probabilities are
temperature-scaled with T = 1.7557, fitted on the validation split only. Even calibrated, most
songs sit near a quadrant corner. That is a real limit of a four-class model: confident songs land
near the diagonals, so on the current catalog 10 of the 16 sections hold songs and Happy,
Alert, Tense, Sad, Fatigued and Calm are empty. Continuous valence/arousal regression is the
fix.

Caveats: the test set is small (about 35 per class, so one song moves a class score by about
3 points); 3 test songs have a cover by another artist in train/val; the lyrics still contain
some Genius page text.

`scripts/score_catalog.py` regenerates a catalog from a checkpoint and a local
`title, artist, lyrics` CSV. Lyrics are only read locally for inference and never written to
the output. `scripts/make_demo_catalog.py` builds the earlier illustrative placeholder
catalog, which is not model output.

## Run

```bash
npm install
npm run dev      # local dev server
npm test         # mapping + nearest-neighbour unit tests
npm run build    # static site in dist/ (relative paths)
```

Add `?embed` (or `#embed`) to the URL to hide the header and method notes, for embedding in
the portfolio site.

## Spotify

Each song links to `open.spotify.com/search/<title artist>`, which works without an API key
or user login. Exact track IDs and in-page playback are a later step and need the Spotify
Web API.
