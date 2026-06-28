// Build MapLibre filter/paint expressions for "is this route open to the
// selected vehicle class on the selected date?"
//
// Mirrors the data model from pipeline/normalize.py:
//   classes     ",passenger,motorcycle,"   (comma-delimited token list)
//   season      "yearlong" | "seasonal"
//   open_start  day-of-year 1..366
//   open_end    day-of-year 1..366  (may be < open_start for winter-wrapping)

import type { ExpressionSpecification } from "maplibre-gl";

/** Day-of-year (1..366) for a JS Date, in local time. */
export function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
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
