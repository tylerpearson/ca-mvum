# Plan 005: Encode per-class season windows in the tiles so routes with divergent windows read correctly for every vehicle profile

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ea0a597..HEAD -- pipeline/normalize.py web/src/legal.ts web/src/main.ts tests/test_normalize.py web/src/legal.test.ts`
> Plans 001/002/004 legitimately touch `main.ts`, `legal.ts`, and the test
> files. Compare the excerpts below against live code; if
> `pipeline/normalize.py`'s excerpted section changed, or `legal.ts` differs
> beyond plan 004's documented change, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (tile schema change; frontend and pipeline must move together)
- **Depends on**: plans/002-verification-baseline.md (required),
  plans/004-local-date-and-doy-alignment.md (required — shares `legal.ts`),
  plans/003-gt50-profile-mapping.md (recommended first — shares `config.ts`
  context and its QA routes)
- **Category**: bug (data model)
- **Planned at**: commit `ea0a597`, 2026-07-01

## Why this matters

Each route feature carries ONE season window (`open_start`/`open_end`), the
"most common bounded window among permitted classes"
(`pipeline/normalize.py:128-137`). But MVUM windows are **per vehicle class**.
The advisor measured the raw statewide data (2026-07-01): **2,885 of 46,662
routes (6.2%) have classes with genuinely different parsed windows** — almost
always "some classes yearlong, others seasonal". Example, Eldorado NF
"HAY FLAT 1" (`10N14H`): `passenger`/`truck` open year-round, but
`high_clearance` and all OHV classes only Apr 1–Dec 31. Today the collapse
makes that route read **seasonal for everyone** — a passenger-car user in
February sees "closed" on a road that is legally open to them. The reverse
error (showing open when a class is out-of-window) also occurs when the
majority window is wider than a minority class's. For a product whose whole
promise is "a confident yes/no they can trust" per vehicle and date, a 6%
systematic error rate on seasonal correctness is the biggest remaining
accuracy gap. Fix: emit per-class windows into the tiles and evaluate them
per-profile-token in the map filter.

## Current state

### Data model (pipeline → tiles → frontend)

`pipeline/normalize.py:109-154` — `normalize_feature` builds:

- `classes`: `",passenger,motorcycle,"` (comma-delimited permitted tokens),
- one representative window:

```python
    # normalize.py:128-137
    bounded = [w for w in windows if w != (1, 365)]
    if bounded:
        start, end = Counter(bounded).most_common(1)[0][0]
        season = "seasonal"
    else:
        start, end = 1, 365
        season = "yearlong"
```

- output props include `season`, `open_start`, `open_end`,
  `window_text` (e.g. `"04/01-12/31"` or `"Yearlong"`).

Windows are parsed per class by `parse_window` (`normalize.py:87-106`):
blank → `None` (not permitted); `"open"`-like or unparseable-but-present →
`(1, 365)`; `"MM/DD-MM/DD"` → non-leap day-of-year tuple. E-bike classes
(`EBIKE_FIELDS`, lines 68-72) are yes/no gates with **no window** — they are
permitted yearlong when present.

`web/src/legal.ts` — consumes those props (after plan 004 lands, `dayOfYear`
uses the non-leap table; the expression builders are unchanged):

```ts
// legal.ts:22-27 — ANY of the profile's tokens appears in `classes`
export function classPermitted(tokens: string[]): ExpressionSpecification {
  const anyOf = tokens.map(
    (t) => ["in", `,${t},`, ["get", "classes"]] as ExpressionSpecification,
  );
  return ["any", ...anyOf] as ExpressionSpecification;
}
// legal.ts:30-45 — dateInSeason(doy): season=="yearlong" -> true; else
//   normal window check, with a wrapping branch when open_end < open_start
// legal.ts:48-50 — isOpen = ["all", classPermitted(tokens), dateInSeason(doy)]
```

`web/src/style.ts:141-172` — `updateRouteFilters` calls `isOpen(tokens, doy)`
and partitions layers; it treats `isOpen` as a black box (no change needed
beyond what compiles).

`web/src/main.ts:202-223` — `popupHtml` shows `["Season", String(p.window_text ?? "—")]`.

### Which tests characterize the behavior this plan changes

- `tests/test_normalize.py` (plan 002): the "passenger open + motorcycle
  05/01-11/15 → whole route seasonal (121,319)" case is explicitly marked for
  THIS plan to update.
- `web/src/legal.test.ts` (plans 002/004): expression-evaluation harness via
  `@maplibre/maplibre-gl-style-spec` `createExpression` — reuse it for the new
  expression shape.

### The new schema (decided — do not redesign)

Keep `classes` as the permission list. Add **per-class window fields only for
classes whose window is bounded** (≠ `(1, 365)`):

- `os_<token>` / `oe_<token>` — ints, e.g. `os_high_clearance: 91`,
  `oe_high_clearance: 365`.
- A class with no `os_/oe_` fields is **yearlong** (this keeps tile size flat
  for the ~94% of routes with no divergence and all fully-yearlong routes).
- Keep `season` (now meaning: "any permitted class has a bounded window"),
  and keep `window_text` for the popup, with `" (varies by class)"` appended
  when permitted classes' windows genuinely differ. Keep `open_start`/
  `open_end` (representative) for now — the popup and any external consumers
  of the committed tiles keep working, and dropping them later is trivial.

Frontend evaluation per token `t` becomes:

```
permitted(t)  = ["in", ",t,", ["get","classes"]]
inWindow(t)   = window check against ["coalesce", ["get","os_t"], 1]
                and ["coalesce", ["get","oe_t"], 365]
openFor(t)    = ["all", permitted(t), inWindow(t)]
isOpen(tokens, doy) = ["any", ...tokens.map(openFor)]
```

`coalesce` handles the missing-field-means-yearlong rule; the wrapping-window
branch (end < start) must be preserved exactly as in the current
`dateInSeason`, applied to the coalesced per-token values.

## Commands you will need

| Purpose        | Command                        | Expected on success |
|----------------|--------------------------------|---------------------|
| Web install    | `cd web && npm install`        | exit 0              |
| Web typecheck  | `cd web && npx tsc --noEmit`   | exit 0              |
| Web tests      | `cd web && npm test`           | all pass            |
| Python tests   | `uv run pytest`                | all pass            |
| Both           | `make test`                    | exit 0              |
| Rebuild data (OPERATOR ONLY — see Step 6) | `make data` | new `web/public/tiles/routes.pmtiles` |

## Scope

**In scope** (the only files you should modify):
- `pipeline/normalize.py`
- `web/src/legal.ts`
- `web/src/main.ts` (popup Season row only, if `window_text` handling changes)
- `tests/test_normalize.py`, `web/src/legal.test.ts`
- `docs/` — nothing mandatory; do not create docs.

**Out of scope** (do NOT touch):
- `web/public/tiles/routes.pmtiles` — the executor must NOT rebuild or commit
  tiles (requires the gitignored 324 MB raw data + tippecanoe + network; the
  operator does Step 6).
- `pipeline/fetch_mvum.py`, `pipeline/build_tiles.py` — schema change is
  entirely in normalize; tippecanoe passes attributes through.
- `web/src/style.ts`, `web/src/config.ts` — `isOpen` keeps its signature
  `(tokens: string[], doy: number)`; nothing upstream changes.
- `DATA_VINTAGE` in `web/src/config.ts` — bumped by the operator with the
  actual rebuild, not by this plan.

## Git workflow

`main` auto-deploys to production — **never commit to `main`; branch + PR.**

- Branch: `advisor/005-per-class-windows`
- Commit style: imperative sentence, e.g. "Encode per-class season windows in
  tiles and evaluate them per profile token".
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Emit per-class windows in `pipeline/normalize.py`

In `normalize_feature`, track windows per class key (you already have the
loop at lines 114-118 building `allowed` + `windows` in parallel — switch to a
dict `key -> (start, end)`). Then:

- For every permitted non-ebike class with a **bounded** window
  `w != (1, 365)`: add `f"os_{key}": w[0]` and `f"oe_{key}": w[1]` to the
  output props.
- E-bike classes: permitted = present-and-truthy, always yearlong (no fields)
  — unchanged from today.
- Keep the representative `season`/`open_start`/`open_end` computation exactly
  as-is (same `Counter` logic).
- `window_text`: unchanged when all permitted classes share one parsed window;
  append `" (varies by class)"` when ≥2 distinct parsed windows exist among
  permitted classes.
- Update the module docstring's output-schema block (lines 14-22) to document
  `os_<class>`/`oe_<class>` and the missing-field-means-yearlong rule.

**Verify**: `uv run pytest` → the marked characterization case FAILS (and
only it, plus any window_text assertions) — confirming the behavior change is
scoped as expected. (You update the tests in Step 4; a temporary red here is
the checkpoint.)

### Step 2: Evaluate per-token windows in `web/src/legal.ts`

Rewrite the expression builders per "The new schema" above:

- Add a private `openForToken(token: string, doy: number)` building
  `["all", ["in", ",<token>,", ["get","classes"]], <window check>]` where the
  window check uses `["coalesce", ["get", "os_<token>"], 1]` /
  `["coalesce", ["get", "oe_<token>"], 365]` and preserves both branches of
  the current `dateInSeason` (normal window when start ≤ end; wrapping
  otherwise). The season=="yearlong" short-circuit is no longer needed
  (coalesce defaults encode yearlong), but keeping it as a fast-path first
  branch is acceptable — decide by what keeps the expression simplest, and
  say which you chose in your report.
- `isOpen(tokens, doy)` becomes `["any", ...tokens.map(openForToken)]`.
- Keep exporting `dayOfYear` and `isOpen` with unchanged signatures. If
  `classPermitted`/`dateInSeason` no longer have callers
  (`grep -rn "classPermitted\|dateInSeason" web/src`), delete them —
  `noUnusedLocals` will insist.
- Update the module header comment's data-model block to the new schema.

**Verify**: `cd web && npx tsc --noEmit` → exit 0.

### Step 3: Popup Season row (main.ts)

No code change should be needed — `window_text` flows through as before, now
sometimes with the `" (varies by class)"` suffix. Confirm `popupHtml` renders
it as-is; only adjust if plan 001's escaping broke on the parenthesized
suffix (it won't — plain ASCII).

**Verify**: `grep -n "window_text" web/src/main.ts` → still exactly one usage.

### Step 4: Update the tests

`tests/test_normalize.py`:

1. Update the marked case: passenger `"open"` + motorcycle `"05/01-11/15"` →
   props contain `os_motorcycle == 121`, `oe_motorcycle == 319`, NO
   `os_passenger` key, `season == "seasonal"`, `window_text` ends with
   `"(varies by class)"`.
2. Add: all classes sharing `"05/01-11/15"` → `os_*`/`oe_*` present for each,
   `window_text == "05/01-11/15"` (no suffix).
3. Add: all-yearlong route → no `os_*`/`oe_*` keys at all
   (`assert not any(k.startswith(("os_","oe_")) for k in props)`).
4. Add: e-bike-only route (`e_bike_class1: "yes"`, nothing else) → still
   returns a feature, `classes == ",e_bike1,"`, no window fields.

`web/src/legal.test.ts` (using the plan-002 evaluator):

5. The HAY FLAT shape: `classes: ",passenger,high_clearance,"`,
   `os_high_clearance: 91, oe_high_clearance: 365` → at doy 50:
   `isOpen(["passenger"], 50)` → **true** (the bug this plan fixes);
   `isOpen(["high_clearance"], 50)` → false;
   `isOpen(["passenger","high_clearance"], 50)` → true (ANY semantics).
6. At doy 200 all three → true.
7. Wrapping per-token window: `os_atv: 305, oe_atv: 90` → open at 1 and 320,
   closed at 200, for `isOpen(["atv"], …)`.
8. Missing window fields mean yearlong: `classes: ",atv,"`, no `os_atv` →
   open at doy 1, 200, 365.

**Verify**: `make test` → ALL pass (both suites green again).

### Step 5: Local end-to-end smoke test (old tiles, new code)

The committed `routes.pmtiles` predates this schema — it has no `os_*` fields.
By design (coalesce defaults) the new frontend must treat every permitted
class as **yearlong** against old tiles — i.e. slightly MORE permissive,
never a crash. `cd web && npm run dev`, load the map, flip vehicles/dates,
confirm routes render and filter without console errors (seasonal closures
won't apply until the operator rebuilds tiles — expected; note it).

**Verify**: map renders; changing vehicle/date repartitions layers; zero
MapLibre expression errors in the browser console.

### Step 6: OPERATOR HANDOFF (do not execute — include in your report)

The maintainer, on a machine with `data/ca-statewide.geojson` (or network for
`make fetch`) and tippecanoe:

1. `make normalize && make tiles` (or full `make data` to also refresh MVUM),
2. bump `DATA_VINTAGE` in `web/src/config.ts` **and** the mirrored text in
   `web/index.html` (`#data-vintage`) if the fetch was refreshed,
3. commit the new `web/public/tiles/routes.pmtiles` on the same PR —
   `.github/workflows/deploy-tiles.yml` auto-uploads it to R2 on merge,
4. verify in production: an Eldorado NF route (e.g. `10N14H` "HAY FLAT 1")
   shows open for "Car / passenger" on a February date, closed for
   "SUV / 4×4".

## Test plan

Steps 4 items 1–8; net expectations: 1 Python case updated + 3 added, ≥4 web
cases added, zero remaining references to the removed builders if deleted.
`make test` green is the gate.

## Done criteria

Machine-checkable. ALL must hold (executor portion — Step 6 is the operator's):

- [ ] `make test` exits 0
- [ ] `cd web && npx tsc --noEmit` exits 0
- [ ] `grep -n "os_" pipeline/normalize.py` shows the per-class emission
- [ ] `grep -n "coalesce" web/src/legal.ts` shows the default-yearlong reads
- [ ] Step 5 smoke test: map renders old tiles without console errors
- [ ] `git status` shows no modified files outside the in-scope list; in
      particular `web/public/tiles/routes.pmtiles` is UNMODIFIED
- [ ] `plans/README.md` status row updated to DONE (code) with a note that
      the tile rebuild (Step 6) is pending on the operator

## STOP conditions

Stop and report back (do not improvise) if:

- `tests/test_normalize.py` or `web/src/legal.test.ts` do not exist (plan 002
  hasn't landed) or `legal.ts` still has the old real-calendar `dayOfYear`
  (plan 004 hasn't landed).
- MapLibre rejects the new expression at `createExpression` time and one
  honest fix attempt fails — report the exact validation error; do not ship a
  simplified expression that drops the wrapping-window branch.
- Old-tile smoke test (Step 5) shows routes disappearing entirely for any
  profile — the coalesce fallback is wrong; stop rather than tweak filters ad hoc.
- You find yourself editing `build_tiles.py` or wanting to rebuild tiles.

## Maintenance notes

- **The tile file and the frontend are now schema-coupled** (loosely — old
  tiles degrade to yearlong-permissive). When the operator rebuilds tiles,
  production gets strictly more accurate; there is no window where the map
  hard-breaks. Reviewers of future schema changes should preserve that
  degrade-gracefully property.
- Attribute bloat watch: `os_/oe_` pairs add ≤28 int attrs on the ~6% of
  routes with bounded windows. If tile size grows unacceptably after rebuild
  (baseline ~16 MB), consider packing (`"91-365"` strings) — deferred until
  measured.
- The representative `open_start`/`open_end`/`season` fields are now
  display-legacy; a future cleanup can drop them from the schema and popup
  once nothing reads them.
- Popup follow-up (deferred): show the per-class windows in the "Open to" row
  (e.g. "High-clearance (04/01–12/31)") instead of the single Season row.
