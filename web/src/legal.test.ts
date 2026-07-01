import { describe, it, expect } from "vitest";
import { expression } from "@maplibre/maplibre-gl-style-spec";
import { dayOfYear, classPermitted, dateInSeason, isOpen } from "./legal";
import type { ExpressionSpecification } from "maplibre-gl";

/** Evaluate a MapLibre expression against a synthetic feature's properties. */
function evalExpr(expr: ExpressionSpecification, props: Record<string, unknown>): unknown {
  const res = expression.createExpression(expr);
  if (res.result === "error") {
    throw new Error(
      "invalid expression: " + res.value.map((e) => e.message).join("; "),
    );
  }
  return res.value.evaluate(
    { zoom: 10 } as never,
    { type: "Feature", properties: props } as never,
  );
}

function evalOpen(tokens: string[], doy: number, props: Record<string, unknown>): boolean {
  return evalExpr(isOpen(tokens, doy), props) as boolean;
}

describe("dayOfYear", () => {
  it("returns 1 for Jan 1", () => {
    expect(dayOfYear(new Date(2026, 0, 1))).toBe(1);
  });

  it("returns 365 for Dec 31 in a non-leap year", () => {
    expect(dayOfYear(new Date(2026, 11, 31))).toBe(365);
  });

  // Characterizes CURRENT (mismatched) behavior: dayOfYear uses the real
  // calendar (366 in a leap year) while the pipeline's _doy uses a fixed
  // non-leap table (max 365). Plan 004 reconciles these; when it does,
  // this assertion must change to reflect the new convention.
  it("returns 366 for Dec 31 in a leap year (current mismatched behavior)", () => {
    expect(dayOfYear(new Date(2028, 11, 31))).toBe(366);
  });
});

describe("classPermitted", () => {
  it("matches when the token is present as a delimited entry", () => {
    const result = evalExpr(classPermitted(["passenger"]), { classes: ",passenger," });
    expect(result).toBe(true);
  });

  it("does not match when the token is absent", () => {
    const result = evalExpr(classPermitted(["passenger"]), { classes: ",atv," });
    expect(result).toBe(false);
  });

  it("matches a multi-token profile against a route with only one of the tokens", () => {
    const result = evalExpr(classPermitted(["passenger", "high_clearance"]), {
      classes: ",high_clearance,",
    });
    expect(result).toBe(true);
  });

  it("delimiters prevent bare-substring hits (,atv, does not match ,utv_atv_x,)", () => {
    const result = evalExpr(classPermitted(["atv"]), { classes: ",utv_atv_x," });
    expect(result).toBe(false);
  });
});

describe("dateInSeason", () => {
  it("yearlong season is open regardless of window fields, at doy 1", () => {
    const result = evalExpr(dateInSeason(1), {
      season: "yearlong",
      open_start: 999,
      open_end: -999,
    });
    expect(result).toBe(true);
  });

  it("yearlong season is open regardless of window fields, at doy 366", () => {
    const result = evalExpr(dateInSeason(366), {
      season: "yearlong",
      open_start: 999,
      open_end: -999,
    });
    expect(result).toBe(true);
  });

  describe("normal (non-wrapping) window: open_start=121, open_end=319", () => {
    const props = { season: "seasonal", open_start: 121, open_end: 319 };
    it("open at the start boundary (121)", () => {
      expect(evalExpr(dateInSeason(121), props)).toBe(true);
    });
    it("open in the middle (200)", () => {
      expect(evalExpr(dateInSeason(200), props)).toBe(true);
    });
    it("open at the end boundary (319)", () => {
      expect(evalExpr(dateInSeason(319), props)).toBe(true);
    });
    it("closed just before the start (120)", () => {
      expect(evalExpr(dateInSeason(120), props)).toBe(false);
    });
    it("closed just after the end (320)", () => {
      expect(evalExpr(dateInSeason(320), props)).toBe(false);
    });
  });

  describe("wrapping (winter) window: open_start=305, open_end=90", () => {
    const props = { season: "seasonal", open_start: 305, open_end: 90 };
    it("open just after the start (306)", () => {
      expect(evalExpr(dateInSeason(306), props)).toBe(true);
    });
    it("open at year end (366)", () => {
      expect(evalExpr(dateInSeason(366), props)).toBe(true);
    });
    it("open at year start (1)", () => {
      expect(evalExpr(dateInSeason(1), props)).toBe(true);
    });
    it("open just before the end (89)", () => {
      expect(evalExpr(dateInSeason(89), props)).toBe(true);
    });
    it("closed in the middle of the off-season (200)", () => {
      expect(evalExpr(dateInSeason(200), props)).toBe(false);
    });
  });
});

describe("isOpen (combined)", () => {
  const props = { classes: ",passenger,", season: "seasonal", open_start: 121, open_end: 319 };

  it("permitted class but out of season -> false", () => {
    expect(evalOpen(["passenger"], 1, props)).toBe(false);
  });

  it("in season but class not permitted -> false", () => {
    expect(evalOpen(["atv"], 200, props)).toBe(false);
  });

  it("permitted class and in season -> true", () => {
    expect(evalOpen(["passenger"], 200, props)).toBe(true);
  });
});
