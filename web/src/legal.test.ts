import { describe, it, expect } from "vitest";
import { expression } from "@maplibre/maplibre-gl-style-spec";
import { dayOfYear, isOpen } from "./legal";
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

  // non-leap convention — must match pipeline/normalize.py _MONTH_START
  it("returns 365 for Dec 31 in a leap year (non-leap convention)", () => {
    expect(dayOfYear(new Date(2028, 11, 31))).toBe(365);
  });

  it("Feb 29 maps to the same value as Mar 1 (non-leap convention)", () => {
    expect(dayOfYear(new Date(2028, 1, 29))).toBe(60);
    expect(dayOfYear(new Date(2028, 2, 1))).toBe(60);
  });

  it("matches the pipeline's parse_window start for 05/01 (cross-convention anchor)", () => {
    expect(dayOfYear(new Date(2026, 4, 1))).toBe(121);
  });
});

describe("isOpen: class permission (delimiter safety)", () => {
  it("matches when the token is present as a delimited entry", () => {
    expect(evalOpen(["passenger"], 1, { classes: ",passenger," })).toBe(true);
  });

  it("does not match when the token is absent", () => {
    expect(evalOpen(["passenger"], 1, { classes: ",atv," })).toBe(false);
  });

  it("matches a multi-token profile against a route with only one of the tokens", () => {
    expect(
      evalOpen(["passenger", "high_clearance"], 1, { classes: ",high_clearance," }),
    ).toBe(true);
  });

  it("delimiters prevent bare-substring hits (,atv, does not match ,utv_atv_x,)", () => {
    expect(evalOpen(["atv"], 1, { classes: ",utv_atv_x," })).toBe(false);
  });
});

describe("isOpen: per-token season window", () => {
  it("missing os_/oe_ fields mean yearlong: open at doy 1, 200, 365", () => {
    const props = { classes: ",atv," };
    expect(evalOpen(["atv"], 1, props)).toBe(true);
    expect(evalOpen(["atv"], 200, props)).toBe(true);
    expect(evalOpen(["atv"], 365, props)).toBe(true);
  });

  describe("normal (non-wrapping) window: os_atv=121, oe_atv=319", () => {
    const props = { classes: ",atv,", os_atv: 121, oe_atv: 319 };
    it("open at the start boundary (121)", () => {
      expect(evalOpen(["atv"], 121, props)).toBe(true);
    });
    it("open in the middle (200)", () => {
      expect(evalOpen(["atv"], 200, props)).toBe(true);
    });
    it("open at the end boundary (319)", () => {
      expect(evalOpen(["atv"], 319, props)).toBe(true);
    });
    it("closed just before the start (120)", () => {
      expect(evalOpen(["atv"], 120, props)).toBe(false);
    });
    it("closed just after the end (320)", () => {
      expect(evalOpen(["atv"], 320, props)).toBe(false);
    });
  });

  describe("wrapping (winter) per-token window: os_atv=305, oe_atv=90", () => {
    const props = { classes: ",atv,", os_atv: 305, oe_atv: 90 };
    it("open just after the start (306)", () => {
      expect(evalOpen(["atv"], 306, props)).toBe(true);
    });
    it("open at year end (366)", () => {
      expect(evalOpen(["atv"], 366, props)).toBe(true);
    });
    it("open at year start (1)", () => {
      expect(evalOpen(["atv"], 1, props)).toBe(true);
    });
    it("open just before the end (89)", () => {
      expect(evalOpen(["atv"], 89, props)).toBe(true);
    });
    it("open at 320 (this plan's test vector)", () => {
      expect(evalOpen(["atv"], 320, props)).toBe(true);
    });
    it("closed in the middle of the off-season (200)", () => {
      expect(evalOpen(["atv"], 200, props)).toBe(false);
    });
  });
});

describe("isOpen (combined)", () => {
  const props = { classes: ",passenger,", os_passenger: 121, oe_passenger: 319 };

  it("permitted class but out of season -> false", () => {
    expect(evalOpen(["passenger"], 1, props)).toBe(false);
  });

  it("in season but class not permitted -> false", () => {
    expect(evalOpen(["atv"], 200, props)).toBe(false);
  });

  it("permitted class and in season -> true", () => {
    expect(evalOpen(["passenger"], 200, props)).toBe(true);
  });

  it("a window ending 12/31 (oe_passenger=365) is OPEN on Dec 31 of a leap year (the leap-year convention this plan preserves)", () => {
    const leapProps = { classes: ",passenger,", os_passenger: 121, oe_passenger: 365 };
    expect(evalOpen(["passenger"], dayOfYear(new Date(2028, 11, 31)), leapProps)).toBe(true);
  });
});

describe("isOpen: per-class divergent windows (the HAY FLAT bug this plan fixes)", () => {
  const props = {
    classes: ",passenger,high_clearance,",
    os_high_clearance: 91,
    oe_high_clearance: 365,
  };

  it("passenger is yearlong (no os_/oe_ fields) -> open at doy 50", () => {
    expect(evalOpen(["passenger"], 50, props)).toBe(true);
  });

  it("high_clearance's own window excludes doy 50 -> closed", () => {
    expect(evalOpen(["high_clearance"], 50, props)).toBe(false);
  });

  it("ANY semantics: a profile passing both tokens is open at doy 50 because passenger is", () => {
    expect(evalOpen(["passenger", "high_clearance"], 50, props)).toBe(true);
  });

  it("at doy 200 (inside high_clearance's window too) all three checks are open", () => {
    expect(evalOpen(["passenger"], 200, props)).toBe(true);
    expect(evalOpen(["high_clearance"], 200, props)).toBe(true);
    expect(evalOpen(["passenger", "high_clearance"], 200, props)).toBe(true);
  });
});
