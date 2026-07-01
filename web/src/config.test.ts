import { describe, it, expect } from "vitest";
import { VEHICLE_PROFILES, CLASS_LABELS } from "./config";

// Canonical pipeline tokens, hardcoded from pipeline/normalize.py:50-72
// (CLASS_DATEFIELD keys + EBIKE_FIELDS keys) as the source of truth.
const CANONICAL_TOKENS = new Set([
  "passenger",
  "high_clearance",
  "truck",
  "bus",
  "motorhome",
  "4wd_gt50",
  "2wd_gt50",
  "tracked_ohv_gt50",
  "other_ohv_gt50",
  "atv",
  "motorcycle",
  "other_wheeled_ohv",
  "tracked_ohv_lt50",
  "other_ohv_lt50",
  "e_bike1",
  "e_bike2",
  "e_bike3",
]);

describe("VEHICLE_PROFILES", () => {
  it("suv4x4 includes the 4WD/2WD >50″ classes so gt50-only trails show open", () => {
    const suv4x4 = VEHICLE_PROFILES.find((p) => p.key === "suv4x4");
    expect(suv4x4).toBeDefined();
    expect(suv4x4!.tokens).toContain("4wd_gt50");
    expect(suv4x4!.tokens).toContain("2wd_gt50");
  });

  it("every token used by every profile has a label in CLASS_LABELS", () => {
    for (const profile of VEHICLE_PROFILES) {
      for (const token of profile.tokens) {
        expect(
          typeof CLASS_LABELS[token] === "string" && CLASS_LABELS[token].length > 0,
          `expected CLASS_LABELS["${token}"] (used by profile "${profile.key}") to be a non-empty string`,
        ).toBe(true);
      }
    }
  });

  it("every token used by every profile is a canonical pipeline token", () => {
    for (const profile of VEHICLE_PROFILES) {
      for (const token of profile.tokens) {
        expect(
          CANONICAL_TOKENS.has(token),
          `token "${token}" (used by profile "${profile.key}") is not in the canonical pipeline token list`,
        ).toBe(true);
      }
    }
  });

  // Deliberate: see plans/003 "decided mapping" — whether a green-sticker
  // UTV >50″ counts as a "4WD vehicle >50″" for a given forest's
  // designation is a genuine domain ambiguity, so utv_wide is left
  // unchanged. Changing this requires the domain check noted in plans/003's
  // maintenance notes (checking against an official MVUM PDF).
  it("utv_wide tokens are unchanged (deliberate, see plans/003)", () => {
    const utvWide = VEHICLE_PROFILES.find((p) => p.key === "utv_wide");
    expect(utvWide).toBeDefined();
    expect(utvWide!.tokens).toEqual(["other_ohv_gt50", "tracked_ohv_gt50"]);
  });
});
