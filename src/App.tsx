import { useMemo, useState } from "react";
import catalog from "./data/catalog.json";
import { MoodGrid } from "./MoodGrid";
import { MIXED_EMOJI, MOODS, emotionAt, nearest, placeSong, spotifySearchUrl } from "./mood";
import type { Mood, Song } from "./mood";

const MATCH_COUNT = 8;
const UNCERTAIN_BELOW = 0.5;
const LABEL: Record<Mood, string> = { happy: "Happy", angry: "Angry", sad: "Sad", relaxed: "Relaxed" };

const embed =
  new URLSearchParams(window.location.search).has("embed") || window.location.hash === "#embed";

export default function App() {
  const songs = useMemo(() => (catalog.songs as Song[]).map(placeSong), []);
  const [pos, setPos] = useState({ valence: 0.55, arousal: 0.45 });
  const [hideUncertain, setHideUncertain] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const pool = hideUncertain ? songs.filter((s) => s.confidence >= UNCERTAIN_BELOW) : songs;
  const matches = nearest(pool, pos.valence, pos.arousal, MATCH_COUNT);
  const matchIds = new Set(matches.map((m) => m.id));
  const feeling = emotionAt(pos.valence, pos.arousal);
  const illustrative = catalog.source !== "bert";
  const labeled = songs.filter((s) => s.true_mood);
  const accuracy = labeled.length ? labeled.filter((s) => s.true_mood === s.top).length / labeled.length : 0;

  return (
    <div className={`app${embed ? " is-embed" : ""}`}>
      {!embed && (
        <header className="masthead">
          <div className="wordmark">
            <span className="wordmark-glyph" aria-hidden="true" />
            Moodify
          </div>
          <p className="tagline">Drag the light to a feeling. Get songs that sound like it.</p>
          <p className="explainer">
            Left to right is how good a song feels, which psychologists call <b>valence</b>. Bottom to
            top is how much energy it carries, called <b>arousal</b>. Together they place 16 everyday
            emotions around a circle.
          </p>
        </header>
      )}

      <main className="stage">
        <section className="map-col" aria-label="Mood map">
          <MoodGrid
            valence={pos.valence}
            arousal={pos.arousal}
            songs={pool}
            matchIds={matchIds}
            hoveredId={hoveredId}
            onMove={(valence, arousal) => setPos({ valence, arousal })}
            onHover={setHoveredId}
          />
          <dl className="readout">
            <div className="feeling">
              <dt>Feeling</dt>
              <dd className={feeling ? `mood-${feeling.mood}` : ""}>
                <span className="feeling-emoji" aria-hidden="true">{feeling ? feeling.emoji : MIXED_EMOJI}</span>
                {feeling ? feeling.name : "Mixed"}
              </dd>
            </div>
            <div><dt>Feels good</dt><dd>{fmt(pos.valence)}</dd></div>
            <div><dt>Energy</dt><dd>{fmt(pos.arousal)}</dd></div>
          </dl>
        </section>

        <section className="list-col" aria-label="Matching songs">
          <div className="list-head">
            <h2>Closest songs</h2>
            <label className="toggle" htmlFor="hide-uncertain">
              <input
                id="hide-uncertain"
                type="checkbox"
                checked={hideUncertain}
                onChange={(e) => setHideUncertain(e.target.checked)}
              />
              Hide uncertain
            </label>
          </div>
          {illustrative && (
            <p className="notice">
              Demo catalog. These mood scores are illustrative placeholders until the BERT model
              scores real lyrics.
            </p>
          )}
          <ol className="tracks">
            {matches.map((s, i) => (
              <li
                key={s.id}
                className={`track${hoveredId === s.id ? " is-hovered" : ""}`}
                onPointerEnter={() => setHoveredId(s.id)}
                onPointerLeave={() => setHoveredId(null)}
              >
                <span className="track-rank">{i + 1}</span>
                <div className="track-main">
                  <span className="track-title">{s.title}</span>
                  <span className="track-artist">
                    {s.artist}
                    {" · "}{emotionAt(s.valence, s.arousal)?.name ?? "Mixed"}
                    {s.true_mood && (
                      <span className={s.true_mood === s.top ? "label-ok" : "label-miss"}>
                        {" · labeled "}{LABEL[s.true_mood]}
                      </span>
                    )}
                  </span>
                  <span className="probbar" aria-label={MOODS.map((m) => `${LABEL[m]} ${Math.round(s.probs[m] * 100)}%`).join(", ")}>
                    {MOODS.map((m) => (
                      <span key={m} className={`seg seg-${m}`} style={{ flexGrow: s.probs[m] }} />
                    ))}
                  </span>
                </div>
                <div className="track-side">
                  {s.confidence < UNCERTAIN_BELOW && <span className="chip">uncertain</span>}
                  <a className="play" href={spotifySearchUrl(s)} target="_blank" rel="noreferrer">
                    Spotify <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </li>
            ))}
          </ol>
          <ul className="legend" aria-label="Bar colours">
            {MOODS.map((m) => (
              <li key={m}><span className={`swatch seg-${m}`} />{LABEL[m]}</li>
            ))}
          </ul>
        </section>
      </main>

      {!embed && (
        <footer className="method">
          <h2>How the map works</h2>
          <p>
            The map follows Russell's circumplex model of affect: valence (how pleasant a feeling is)
            runs left to right and arousal (how activated it is) runs bottom to top. The 16 sections
            are the emotion words from Feldman Barrett and Russell's version of the model, four per
            quadrant, drawn here as equal slices.
          </p>
          <p>
            A BERT model fine-tuned on MoodyLyrics reads each song's lyrics and gives probabilities
            for four moods, one per quadrant: happy, angry, sad and relaxed. A song is placed at the
            probability-weighted average of those four corners, and its emotion is the section it
            lands in:
          </p>
          <pre className="formula">{`valence = p(happy) + p(relaxed) − p(angry) − p(sad)
arousal = p(happy) + p(angry) − p(sad) − p(relaxed)`}</pre>
          <p>
            These are not measured valence and arousal scores. A song the model is unsure about
            drifts toward the centre, which is marked <em>Mixed</em>. Because the model only knows
            four moods, a confident song lands near a corner, so most songs fall in the sections
            either side of each diagonal (Elated or Excited, Nervous or Stressed, Depressed or
            Lethargic, Serene or Relaxed). Sections next to the axes, such as Happy, Alert, Sad or Calm, only fill when the model
            splits its vote between two moods. Lyrics only: tempo, key and production are not used yet.
          </p>
          {!illustrative && (
            <p>
              Every song on the map is from the held-out test split, so the model never saw it in
              training. On those {catalog.songs.length} songs it picks the labeled mood{" "}
              {Math.round(accuracy * 1000) / 10}% of the time. The test set is small (about 35 songs
              per mood), and the most common mistake is calling a relaxed song happy. The raw
              model was overconfident, so its scores are softened with temperature scaling fitted on
              separate validation songs. Even so, most songs sit close to a corner: a four-class
              model knows which quadrant a song is in, not where inside it.
            </p>
          )}
          <p className="fine">
            Songs open as a Spotify search. No account or login is needed here, and no lyrics are
            stored on this page.
          </p>
        </footer>
      )}
    </div>
  );
}

function fmt(v: number) {
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;
}
