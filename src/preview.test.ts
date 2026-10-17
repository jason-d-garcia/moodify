import { describe, expect, it } from "vitest";
import { isMatch, normalize } from "./preview";

const t = (trackName: string, artistName: string) => ({ trackName, artistName, previewUrl: "https://x/p.m4a" });

describe("normalize", () => {
  it("drops brackets, credits, accents and punctuation", () => {
    expect(normalize("Despacito (Remix) [feat. Justin Bieber]")).toBe("despacito");
    expect(normalize("Señorita")).toBe("senorita");
    expect(normalize("Don't Stop Believin'")).toBe("don t stop believin");
    expect(normalize("Hall & Oates")).toBe("hall and oates");
  });
});

describe("isMatch", () => {
  const song = { title: "Uptown Funk", artist: "Mark Ronson featuring Bruno Mars" };
  it("accepts the same title by an overlapping artist", () => {
    expect(isMatch(song, t("Uptown Funk (feat. Bruno Mars)", "Mark Ronson"))).toBe(true);
  });
  it("rejects a different title or a different artist", () => {
    expect(isMatch(song, t("Uptown Special", "Mark Ronson"))).toBe(false);
    expect(isMatch(song, t("Uptown Funk", "Kidz Bop Kids"))).toBe(false);
  });
  it("rejects tracks without a preview", () => {
    expect(isMatch(song, { trackName: "Uptown Funk", artistName: "Mark Ronson" })).toBe(false);
  });
});
