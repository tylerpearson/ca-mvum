# Plan 003: Map the 4WD/2WD >50″ MVUM classes into the street-legal 4×4 profile so 735 orphaned routes become visible

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ea0a597..HEAD -- web/src/config.ts`
> If `web/src/config.ts` changed since this plan was written, compare the
> "Current state" excerpt against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (one-line data mapping; the risk is *domain* correctness, addressed below)
- **Depends on**: plans/002-verification-baseline.md (for the test; the code
  change itself has no dependency)
- **Category**: bug
- **Planned at**: commit `ea0a597`, 2026-07-01

## Why this matters

The vehicle selector maps each *profile* (what the user drives) to a set of
underlying MVUM class tokens; a route reads "open" if it permits ANY of the
profile's tokens. **No profile includes the `4wd_gt50` or `2wd_gt50` tokens**
("4WD/2WD vehicles greater than 50 inches wide" — the classic Jeep-trail
designation). The advisor verified against the raw statewide MVUM data
(46,662 routes with ≥1 permitted class): **735 routes permit ONLY those
classes** — including well-known 4×4 trails like Cleveland NF's Bronco Peak
Loops A–D — and therefore render as "closed / not allowed" for **every**
profile, forever. The audience PRODUCT.md names first ("OHV … 4WD/overland")
is exactly who these routes exist for. The product's core promise is a
"confident yes/no they can trust"; today the answer for these 735 routes is a
confident *wrong* no.

## Current state

`web/src/config.ts:19-29` — the profile table:

```ts
export const VEHICLE_PROFILES: VehicleProfile[] = [
  // Street-legal: highway-legal roads are the big set; plated bikes add moto trails.
  { key: "moto_plated", label: "Dual-sport motorcycle (plated)", group: "Street-legal (plated)", tokens: ["passenger", "high_clearance", "motorcycle"] },
  { key: "suv4x4", label: "SUV / 4×4 / truck (street-legal)", group: "Street-legal (plated)", tokens: ["passenger", "high_clearance"] },
  { key: "car", label: "Car / passenger (street-legal)", group: "Street-legal (plated)", tokens: ["passenger"] },
  // Off-road only: OHV-designated routes for that class.
  { key: "dirtbike", label: "Dirt bike (OHV / green sticker)", group: "Off-road only (green / red sticker)", tokens: ["motorcycle"] },
  { key: "atv", label: "ATV (OHV)", group: "Off-road only (green / red sticker)", tokens: ["atv"] },
  { key: "utv_narrow", label: "UTV / side-by-side ≤50″ (OHV)", group: "Off-road only (green / red sticker)", tokens: ["other_wheeled_ohv", "other_ohv_lt50", "tracked_ohv_lt50"] },
  { key: "utv_wide", label: "UTV / side-by-side >50″ (OHV)", group: "Off-road only (green / red sticker)", tokens: ["other_ohv_gt50", "tracked_ohv_gt50"] },
];
```

The token vocabulary comes from `pipeline/normalize.py:50-65`
(`CLASS_DATEFIELD`) — it includes `"4wd_gt50"` and `"2wd_gt50"`, sourced from
the MVUM fields `fourwd_gt50_datesopen` / `twowd_gt50_datesopen`. Popup labels
for both tokens already exist in `CLASS_LABELS` (`config.ts:37-38`: "4WD >50″",
"2WD >50″"), so popups already display them — only the open/closed profile
logic ignores them.

**The decided mapping** (do not re-litigate; the rationale is recorded here):

- `suv4x4` gains `"4wd_gt50"` and `"2wd_gt50"`. A street-legal SUV/4×4/truck
  is a 4WD (or 2WD) vehicle wider than 50″; MVUM class designations are by
  vehicle type/width, not registration, and a plated vehicle may use routes
  designated for its type. This makes the 735 orphaned routes visible under
  the profile that matches the vehicles they were designated for.
- `utv_wide` (>50″ side-by-sides) is **deliberately left unchanged**. Whether
  a green-sticker UTV counts as a "4WD vehicle >50″" for a given forest's
  designation is a genuine domain ambiguity, and the product's stance (see
  `PRODUCT.md` "Design Principles": legal clarity is the headline) is to
  prefer under-showing over wrongly showing a route as open. Recorded as a
  maintenance note for a future check against an official MVUM PDF.

Data facts backing this (measured by the advisor on 2026-07-01 against
`data/ca-statewide.geojson`, which is gitignored and may not exist in your
checkout — do NOT try to regenerate it): 36,582 routes permit
`4wd_gt50`/`2wd_gt50` (mostly alongside `passenger`/`high_clearance`, where
this change is a no-op); 735 permit *only* gt50 classes, all of them `kind:
"trail"`.

## Commands you will need

| Purpose   | Command                          | Expected on success |
|-----------|----------------------------------|---------------------|
| Install   | `cd web && npm install`          | exit 0              |
| Typecheck | `cd web && npx tsc --noEmit`     | exit 0              |
| Tests     | `cd web && npm test`             | all pass            |
| Dev server| `cd web && npm run dev`          | Vite on :5173       |

## Scope

**In scope** (the only files you should modify):
- `web/src/config.ts` (the `suv4x4` entry's `tokens` array + its comment)
- `web/src/config.test.ts` (create — see Test plan)

**Out of scope** (do NOT touch):
- `pipeline/normalize.py` — the tokens are already emitted; nothing to change.
- `web/src/legal.ts` — the ANY-of-tokens logic already handles more tokens.
- All other profiles (`utv_wide` especially — see the decided mapping above).
- `CLASS_LABELS` — labels already exist.

## Git workflow

`main` auto-deploys to production — **never commit to `main`; branch + PR.**

- Branch: `advisor/003-gt50-profile-mapping`
- Commit style: imperative sentence, e.g. "Open 4WD/2WD >50″ routes to the street-legal 4×4 profile".
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the tokens to the suv4x4 profile

In `web/src/config.ts`, change the `suv4x4` line to:

```ts
  { key: "suv4x4", label: "SUV / 4×4 / truck (street-legal)", group: "Street-legal (plated)", tokens: ["passenger", "high_clearance", "4wd_gt50", "2wd_gt50"] },
```

Extend the comment block above `VEHICLE_PROFILES` (lines ~19-20) with one
sentence recording the decision, e.g.: `// suv4x4 includes the 4WD/2WD >50″
classes: MVUM designates by vehicle type/width, and a street-legal 4×4 IS a
4WD >50″ — without these tokens, gt50-only jeep trails (e.g. Bronco Peak,
Cleveland NF) would never show open for anyone.`

**Verify**: `cd web && npx tsc --noEmit` → exit 0.

### Step 2: Pin the mapping with a test

Create `web/src/config.test.ts` (import `describe/it/expect` from `"vitest"`,
matching `web/src/legal.test.ts` from plan 002):

1. The `suv4x4` profile's tokens include `"4wd_gt50"` and `"2wd_gt50"`.
2. Every token used by every profile has a label in `CLASS_LABELS` (guards
   against future token typos — iterate `VEHICLE_PROFILES` and assert
   `CLASS_LABELS[token]` is a non-empty string).
3. Every token used by every profile is one of the canonical pipeline tokens.
   Hardcode the canonical list from `pipeline/normalize.py` `CLASS_DATEFIELD`
   keys + `EBIKE_FIELDS` keys into the test with a comment pointing at
   `pipeline/normalize.py:50-72` as the source of truth.
4. `utv_wide` tokens equal exactly `["other_ohv_gt50", "tracked_ohv_gt50"]`,
   with a comment: deliberate — see plans/003 "decided mapping"; changing this
   requires the domain check in the maintenance notes.

**Verify**: `cd web && npm test` → all pass (including plan 002's suites).

### Step 3: Manual QA

`cd web && npm run dev`, open http://localhost:5173:

1. Select vehicle "SUV / 4×4 / truck (street-legal)". Navigate to Cleveland
   National Forest (forest quick-jump), zoom toward its OHV areas (around
   33.4°N, -117.4°W — the Wildomar OHV area). Trails named "BRONCO PEAK LOOP"
   / "WILDOMAR" should render **purple dashed (open)** rather than gray.
2. Click one of them: the popup's "Open to" row should include "4WD >50″".
3. Switch to "Car / passenger (street-legal)": the same trails must return to
   gray dashed (closed/not allowed).

(Uses the dev tile file `web/public/tiles/routes.pmtiles`, which is committed
— no data rebuild needed; the `classes` attribute already carries the tokens.)

**Verify**: the three checks above pass (report each; include which route you
clicked).

## Test plan

Covered in Step 2 — 4 new cases in `web/src/config.test.ts`, modeled on plan
002's `legal.test.ts` style. Full check: `cd web && npm test` → green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n '4wd_gt50' web/src/config.ts` shows the token inside the
      `suv4x4` tokens array
- [ ] `cd web && npx tsc --noEmit` exits 0
- [ ] `cd web && npm test` exits 0, including the 4 new config tests
- [ ] Manual QA step 3 confirmed (open under suv4x4, closed under car)
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `VEHICLE_PROFILES` excerpt doesn't match the live code (drift).
- In manual QA, the Bronco Peak / Wildomar trails do NOT turn purple under the
  suv4x4 profile after the change — that would mean the committed tile file's
  `classes` values differ from what the advisor measured in the raw data
  (e.g. the tiles predate the token). Report; do not attempt a tile rebuild.
- You are tempted to add tokens to any profile other than `suv4x4`.

## Maintenance notes

- **Open domain question (deferred, deliberately):** should `utv_wide` also
  include `4wd_gt50`? To resolve it, check an official MVUM PDF legend (linked
  from every route popup via the R5 MVUM Finder) for how a specific forest
  defines the ">50 inches" 4WD class versus "other OHV >50″". If the legend
  treats wide UTVs as that class, add the token and update the pinned
  `utv_wide` test.
- The `truck`, `bus`, `motorhome`, and `e_bike*` tokens remain intentionally
  unmapped to any profile (labels only). If a "motorhome/bus" profile is ever
  requested, the same ANY-of-tokens mechanism handles it.
- Reviewer should scrutinize: exactly one profile line changed; the pinned
  tests in `config.test.ts` match the decided mapping.
