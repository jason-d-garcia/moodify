import { describe, expect, it } from "vitest";
import { EMOTIONS, quadrantOf, blendAt, emotionAt, nearest, placeSong, spotifySearchUrl, toValenceArousal } from "./mood";

const one = (m: "happy" | "sad" | "angry" | "relaxed") => ({
  happy: 0, sad: 0, angry: 0, relaxed: 0, [m]: 1,
});

describe("toValenceArousal", () => {
  it("puts each pure class in its quadrant corner", () => {
    expect(toValenceArousal(one("happy"))).toEqual({ valence: 1, arousal: 1 });
    expect(toValenceArousal(one("angry"))).toEqual({ valence: -1, arousal: 1 });
    expect(toValenceArousal(one("sad"))).toEqual({ valence: -1, arousal: -1 });
    expect(toValenceArousal(one("relaxed"))).toEqual({ valence: 1, arousal: -1 });
  });

  it("maps a uniform prediction to the centre", () => {
    expect(toValenceArousal({ happy: 0.25, sad: 0.25, angry: 0.25, relaxed: 0.25 }))
      .toEqual({ valence: 0, arousal: 0 });
  });

  it("splits happy/relaxed onto the positive valence axis", () => {
    const { valence, arousal } = toValenceArousal({ happy: 0.5, sad: 0, angry: 0, relaxed: 0.5 });
    expect(valence).toBeCloseTo(1);
    expect(arousal).toBeCloseTo(0);
  });

  it("normalises probabilities that do not sum to one", () => {
    expect(toValenceArousal({ happy: 2, sad: 0, angry: 0, relaxed: 0 }))
      .toEqual({ valence: 1, arousal: 1 });
  });
});

describe("placeSong / nearest", () => {
  const songs = [
    placeSong({ title: "A", artist: "x", probs: one("happy") }, 0),
    placeSong({ title: "B", artist: "x", probs: one("sad") }, 1),
    placeSong({ title: "C", artist: "x", probs: { happy: 0.4, sad: 0.2, angry: 0.2, relaxed: 0.2 } }, 2),
  ];

  it("records the top class and its probability", () => {
    expect(songs[2].top).toBe("happy");
    expect(songs[2].confidence).toBe(0.4);
  });

  it("orders songs by distance to the cursor", () => {
    expect(nearest(songs, 0.9, 0.9, 3).map((s) => s.title)).toEqual(["A", "C", "B"]);
    expect(nearest(songs, -1, -1, 1)[0].title).toBe("B");
  });
});

describe("blendAt", () => {
  it("is all happy in the top-right corner and even at the centre", () => {
    expect(blendAt(1, 1).happy).toBe(1);
    const c = blendAt(0, 0);
    expect([c.happy, c.sad, c.angry, c.relaxed]).toEqual([0.25, 0.25, 0.25, 0.25]);
  });
});

it("builds a Spotify search link without login", () => {
  expect(spotifySearchUrl({ title: "Hey Ya!", artist: "OutKast" }))
    .toBe("https://open.spotify.com/search/Hey%20Ya!%20OutKast");
});

describe("emotionAt", () => {
  it("names the section a point falls in", () => {
    expect(emotionAt(1, 0.1)?.name).toBe("Happy");
    expect(emotionAt(0.1, 1)?.name).toBe("Alert");
    expect(emotionAt(-0.1, 1)?.name).toBe("Tense");
    expect(emotionAt(-1, -0.1)?.name).toBe("Sad");
    expect(emotionAt(0.1, -1)?.name).toBe("Calm");
    expect(emotionAt(1, -0.1)?.name).toBe("Contented");
    expect(emotionAt(0.9, -0.5)?.name).toBe("Serene");
  });

  it("keeps each emotion in its own quadrant", () => {
    expect(EMOTIONS).toHaveLength(16);
    expect(new Set(EMOTIONS.map((e) => e.emoji)).size).toBe(16);
    for (const e of EMOTIONS) {
      const mid = ((e.from + e.to) / 2) * (Math.PI / 180);
      expect(placeSong({ title: "", artist: "", probs: { happy: 0, sad: 0, angry: 0, relaxed: 0, [e.mood]: 1 } }, 0).top)
        .toBe(e.mood);
      const v = Math.cos(mid), a = Math.sin(mid);
      expect(emotionAt(v, a)).toBe(e);
    }
  });

  it("calls the centre mixed", () => {
    expect(emotionAt(0.05, -0.1)).toBeNull();
  });
});

describe("valence/arousal songs", () => {
  it("uses predicted coordinates directly", () => {
    const s = placeSong({ title: "A", artist: "x", valence: -0.3, arousal: 0.6 }, 0);
    expect([s.valence, s.arousal, s.top, s.confidence]).toEqual([-0.3, 0.6, "angry", 1]);
    expect(quadrantOf(0.2, -0.1)).toBe("relaxed");
  });
});
