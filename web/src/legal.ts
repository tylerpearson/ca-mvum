// Build MapLibre filter/paint expressions for "is this route open to the
// selected vehicle class on the selected date?"
//
// Mirrors the data model from pipeline/normalize.py:
//   classes     ",passenger,motorcycle,"   (comma-delimited token list)
//   season      "yearlong" | "seasonal"
//   open_start  day-of-year 1..365 (non-leap convention)
//   open_end    day-of-year 1..365 (non-leap convention)  (may be < open_start for winter-wrapping)

import type { ExpressionSpecification } from "maplibre-gl";

// Cumulative day-of-year for the 1st of each month (non-leap); index 1..12.
// MUST match _MONTH_START in pipeline/normalize.py — the tiles encode season
// windows with this table, so the frontend has to count days the same way.
// Feb 29 intentionally maps to 60 (== Mar 1), same as the pipeline.
const MONTH_START = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/** Day-of-year (1..365, non-leap convention) for a JS Date, in local time. */
export function dayOfYear(d: Date): number {
  return MONTH_START[d.getMonth() + 1] + d.getDate();
}

/** True-expression: the route permits ANY of the profile's class tokens.
 *  A street-legal profile passes several tokens (highway-legal roads + its OHV
 *  trails); an OHV-only profile passes one. */
export function classPermitted(tokens: string[]): ExpressionSpecification {
  const anyOf = tokens.map(
    (t) => ["in", `,${t},`, ["get", "classes"]] as ExpressionSpecification,
  );
  return ["any", ...anyOf] as ExpressionSpecification;
}

/** True-expression: the route's season window contains `doy`. */
export function dateInSeason(doy: number): ExpressionSpecification {
  return [
    "case",
    ["==", ["get", "season"], "yearlong"],
    true,
    // normal window: start <= end
    ["<=", ["get", "open_start"], ["get", "open_end"]],
    [
      "all",
      [">=", doy, ["get", "open_start"]],
      ["<=", doy, ["get", "open_end"]],
    ],
    // wrapping window (e.g. winter): open if after start OR before end
    ["any", [">=", doy, ["get", "open_start"]], ["<=", doy, ["get", "open_end"]]],
  ] as unknown as ExpressionSpecification;
}

/** Combined: permitted for the profile AND in-season on the date. */
export function isOpen(tokens: string[], doy: number): ExpressionSpecification {
  return ["all", classPermitted(tokens), dateInSeason(doy)] as ExpressionSpecification;
}
