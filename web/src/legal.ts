// Build MapLibre filter/paint expressions for "is this route open to the
// selected vehicle class on the selected date?"
//
// Mirrors the data model from pipeline/normalize.py:
//   classes      ",passenger,motorcycle,"   (comma-delimited token list)
//   season       "yearlong" | "seasonal"    (representative summary; display only)
//   open_start   day-of-year 1..365 (non-leap convention, representative — display only)
//   open_end     day-of-year 1..365 (non-leap convention, representative — display only)
//   os_<class>   day-of-year 1..365 — start of THAT class's bounded window.
//                Present only when the class is permitted and its window is
//                bounded (not year-round). Missing means yearlong for that class.
//   oe_<class>   day-of-year 1..365 — end of that class's bounded window,
//                paired with os_<class> (may be < os_<class> for winter-wrapping).
//
// Per-class windows are the authoritative source for per-vehicle-profile
// filtering: two classes on the same route can have genuinely different
// season windows (e.g. passenger yearlong, motorcycle seasonal), so `isOpen`
// evaluates each requested class token against ITS OWN os_/oe_ fields rather
// than the route-level representative window.

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

/** True-expression: the route permits `token` AND `token`'s own season
 *  window (os_<token>/oe_<token>, defaulting to yearlong when absent)
 *  contains `doy`. */
function openForToken(token: string, doy: number): ExpressionSpecification {
  const start = ["coalesce", ["get", `os_${token}`], 1] as ExpressionSpecification;
  const end = ["coalesce", ["get", `oe_${token}`], 365] as ExpressionSpecification;
  return [
    "all",
    ["in", `,${token},`, ["get", "classes"]],
    [
      "case",
      // normal window: start <= end
      ["<=", start, end],
      ["all", [">=", doy, start], ["<=", doy, end]],
      // wrapping window (e.g. winter): open if after start OR before end
      ["any", [">=", doy, start], ["<=", doy, end]],
    ],
  ] as unknown as ExpressionSpecification;
}

/** True-expression: the route is open to ANY of the profile's class tokens
 *  on `doy`, each evaluated against its own per-class window (ANY semantics —
 *  a street-legal profile passes several tokens; an OHV-only profile passes
 *  one). */
export function isOpen(tokens: string[], doy: number): ExpressionSpecification {
  return ["any", ...tokens.map((t) => openForToken(t, doy))] as ExpressionSpecification;
}
