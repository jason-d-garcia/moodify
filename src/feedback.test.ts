import { describe, expect, it } from "vitest";
import { PRIOR_VOTES, aggregate, blend, confidenceLabel, listenerConfidence, songKey } from "./feedback";

describe("songKey", () => {
  it("ignores case and outer spaces", () => {
    expect(songKey({ title: " Jolene ", artist: "Dolly Parton" })).toBe("jolene|dolly parton");
  });
});

describe("aggregate", () => {
  it("uses the median so one outlier can't drag a song", () => {
    const agg = aggregate([{ v: 0.5, a: 0.5 }, { v: 0.6, a: 0.4 }, { v: -1, a: -1 }])!;
    expect(agg).toMatchObject({ n: 3, v: 0.5, a: 0.4 });
  });
  it("returns null with no placements", () => {
    expect(aggregate([])).toBeNull();
  });
});

describe("blend", () => {
  const model = { valence: 0, arousal: 0 };
  it("keeps the model spot without votes", () => {
    expect(blend(model, undefined)).toEqual(model);
  });
  it("moves toward listeners as votes add up", () => {
    const one = blend(model, { n: 1, v: 0.8, a: 0.8, spread: 0 });
    const many = blend(model, { n: 30, v: 0.8, a: 0.8, spread: 0 });
    expect(one.valence).toBeCloseTo(0.8 / (1 + PRIOR_VOTES));
    expect(many.valence).toBeGreaterThan(0.7);
  });
});

describe("listenerConfidence", () => {
  it("rises with agreeing listeners and stays low when they disagree", () => {
    expect(listenerConfidence(undefined)).toBe(0);
    const agree = listenerConfidence({ n: 12, v: 0, a: 0, spread: 0.05 });
    const split = listenerConfidence({ n: 12, v: 0, a: 0, spread: 0.7 });
    expect(agree).toBeGreaterThan(0.6);
    expect(split).toBe(0);
    expect(confidenceLabel({ n: 12, v: 0, a: 0, spread: 0.05 })).toBe("12 listeners, high agreement");
  });
});
