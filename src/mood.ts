export type Mood = "happy" | "sad" | "angry" | "relaxed";
export type Probs = Record<Mood, number>;

export interface Song {
  title: string;
  artist: string;
  /** Four-class model output. Absent when the model predicts valence/arousal directly. */
  probs?: Probs;
  /** Valence/arousal regression output in [-1, 1]. */
  valence?: number;
  arousal?: number;
  /** MoodyLyrics label, present for held-out test songs. */
  true_mood?: Mood;
  /** Dataset valence/arousal for held-out test songs (MERGE). */
  true_valence?: number;
  true_arousal?: number;
  split?: "test" | "demo";
  /** First year on the Billboard year-end Hot 100, and best rank across years. */
  year?: number;
  peak_rank?: number;
}

export interface PlacedSong extends Song {
  id: string;
  valence: number;
  arousal: number;
  /** Highest class probability. Low values mean the model was unsure. */
  confidence: number;
  top: Mood;
}

export const MOODS: Mood[] = ["happy", "angry", "sad", "relaxed"];

/** Quadrant corners in Russell's circumplex, as used by MoodyLyrics. */
export const QUADRANT: Record<Mood, { valence: number; arousal: number }> = {
  happy: { valence: 1, arousal: 1 },
  angry: { valence: -1, arousal: 1 },
  sad: { valence: -1, arousal: -1 },
  relaxed: { valence: 1, arousal: -1 },
};

/**
 * Expected quadrant coordinates: V = p_happy + p_relaxed - p_angry - p_sad,
 * A = p_happy + p_angry - p_sad - p_relaxed. A song the model is unsure about
 * lands near the centre, so (0, 0) can mean "uncertain" as well as "neutral".
 */
export function toValenceArousal(p: Probs): { valence: number; arousal: number } {
  const total = p.happy + p.sad + p.angry + p.relaxed || 1;
  const n = (m: Mood) => p[m] / total;
  return {
    valence: n("happy") + n("relaxed") - n("angry") - n("sad"),
    arousal: n("happy") + n("angry") - n("sad") - n("relaxed"),
  };
}

/** The quadrant mood a point falls in. */
export function quadrantOf(valence: number, arousal: number): Mood {
  if (arousal >= 0) return valence >= 0 ? "happy" : "angry";
  return valence >= 0 ? "relaxed" : "sad";
}

export function placeSong(song: Song, index: number): PlacedSong {
  const id = `${index}-${song.artist}-${song.title}`;
  if (song.valence !== undefined && song.arousal !== undefined) {
    return { ...song, id, valence: song.valence, arousal: song.arousal, confidence: 1,
      top: quadrantOf(song.valence, song.arousal) };
  }
  const probs = song.probs!;
  const { valence, arousal } = toValenceArousal(probs);
  const top = MOODS.reduce((a, b) => (probs[b] > probs[a] ? b : a));
  return { ...song, id, valence, arousal, confidence: probs[top], top };
}

export function nearest(
  songs: PlacedSong[],
  valence: number,
  arousal: number,
  k: number,
): (PlacedSong & { distance: number })[] {
  return songs
    .map((s) => ({ ...s, distance: Math.hypot(s.valence - valence, s.arousal - arousal) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k);
}

/** Bilinear weights of the four quadrant corners at a grid point. Sums to 1. */
export function blendAt(valence: number, arousal: number): Probs {
  const x = (valence + 1) / 2;
  const y = (arousal + 1) / 2;
  return {
    happy: x * y,
    angry: (1 - x) * y,
    sad: (1 - x) * (1 - y),
    relaxed: x * (1 - y),
  };
}

export function spotifySearchUrl(song: Pick<Song, "title" | "artist">): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${song.title} ${song.artist}`)}`;
}

export interface Emotion {
  name: string;
  emoji: string;
  /** Quadrant the emotion sits in, used for its colour. */
  mood: Mood;
  /** Sector bounds in degrees, counter-clockwise from "feels good" (positive valence). */
  from: number;
  to: number;
}

/**
 * The 16 affect words of Russell's circumplex as drawn by Feldman Barrett & Russell (1998)
 * and Posner, Russell & Peterson (2005): four per quadrant, each given an equal 22.5° slice.
 * The equal spacing is a simplification of the published figure, which is schematic.
 */
export const EMOTIONS: Emotion[] = [
  ["Happy", "happy", "😊"], ["Elated", "happy", "🥳"], ["Excited", "happy", "🤩"], ["Alert", "happy", "😮"],
  ["Tense", "angry", "😰"], ["Nervous", "angry", "😬"], ["Stressed", "angry", "😖"], ["Upset", "angry", "😡"],
  ["Sad", "sad", "😢"], ["Depressed", "sad", "😞"], ["Lethargic", "sad", "🥱"], ["Fatigued", "sad", "😴"],
  ["Calm", "relaxed", "🙂"], ["Relaxed", "relaxed", "😎"], ["Serene", "relaxed", "😌"], ["Contented", "relaxed", "😇"],
].map(([name, mood, emoji], i) => ({ name, mood: mood as Mood, emoji, from: i * 22.5, to: (i + 1) * 22.5 }));

export const MIXED_EMOJI = "😐";

/** Below this distance from the centre the model's mood is too mixed to name. */
export const MIXED_RADIUS = 0.2;

export function emotionAt(valence: number, arousal: number): Emotion | null {
  if (Math.hypot(valence, arousal) < MIXED_RADIUS) return null;
  const deg = ((Math.atan2(arousal, valence) * 180) / Math.PI + 360) % 360;
  return EMOTIONS[Math.min(15, Math.floor(deg / 22.5))];
}
