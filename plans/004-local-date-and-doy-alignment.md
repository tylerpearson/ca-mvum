# Plan 004: Default the date picker to the user's local date and align day-of-year math with the pipeline's non-leap convention

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ea0a597..HEAD -- web/src/main.ts web/src/legal.ts web/src/legal.test.ts`
> Plans 001 (main.ts popups) and 002 (legal.test.ts creation) legitimately
> touch these files — expected drift. Compare the specific excerpts below
> against the live code; if the *excerpted lines themselves* changed beyond
> plans 001/002's scope, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/002-verification-baseline.md (this plan updates a
  characterization test that 002 creates)
- **Category**: bug
- **Planned at**: commit `ea0a597`, 2026-07-01

## Why this matters

Two small date bugs undermine the season filter — the feature `PRODUCT.md`
calls out as question #1 ("open to *my* vehicle on *this* date?"):

1. **The date picker defaults to the UTC date, not the user's date.** After
   4/5 pm Pacific, `new Date().toISOString()` is already *tomorrow*. The
   product's primary stated moment of use is "the night before or at the
   trailhead" — i.e. exactly the evening hours where every user starts the
   map filtered to the wrong day.
2. **Leap-year drift between frontend and pipeline.** The pipeline encodes
   season windows as day-of-year using a fixed **non-leap** month table
   (`pipeline/normalize.py` `_MONTH_START`; Dec 31 = 365, always). The
   frontend computes the *actual* day-of-year (Feb 29 exists), so in leap
   years every date after Feb 28 compares one day high: seasonal boundaries
   shift by a day, and a window ending 12/31 (encoded 365) reads **closed on
   Dec 31** of a leap year (doy 366 > 365). Next occurrence: 2028 — and users
   can already select 2028 dates in the picker today.

Both fixes are a few lines; the point of this plan is doing them **to match
the pipeline's convention exactly** and pinning that with tests.

## Current state

The UTC default, `web/src/main.ts:113`:

```ts
dateInput.value = new Date().toISOString().slice(0, 10);
```

(Note the repo already has a correct local-date formatter to model on:
`web/src/export.ts:171-176` `today()` builds `YYYY-MM-DD` from
`getFullYear/getMonth/getDate`.)

The selected-date parser, `web/src/main.ts:120-123` (already correct — parses
at local noon; do not change):

```ts
function selectedDoy(): number {
  const d = dateInput.value ? new Date(`${dateInput.value}T12:00:00`) : new Date();
  return dayOfYear(d);
}
```

The real-calendar DOY, `web/src/legal.ts:12-17`:

```ts
/** Day-of-year (1..366) for a JS Date, in local time. */
export function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}
```

The pipeline convention it must match, `pipeline/normalize.py:74-80`:

```python
# Cumulative day-of-year for the 1st of each month (non-leap); index 1..12.
_MONTH_START = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]

def _doy(month: int, day: int) -> int:
    """Day-of-year (1..365) for a month/day, ignoring leap years."""
    return _MONTH_START[month] + day
```

Note the pipeline maps Feb 29 → `31 + 29 = 60`, i.e. the same value as Mar 1.
The frontend must reproduce exactly that (a Feb 29 user counts as Mar 1 for
season purposes — windows starting "03/01" correctly include it).

Plan 002 created a deliberate characterization test in
`web/src/legal.test.ts`: `dayOfYear(new Date(2028, 11, 31)) === 366`, marked
with a comment that THIS plan flips it to 365.

## Commands you will need

| Purpose   | Command                          | Expected on success |
|-----------|----------------------------------|---------------------|
| Install   | `cd web && npm install`          | exit 0              |
| Typecheck | `cd web && npx tsc --noEmit`     | exit 0              |
| Tests     | `cd web && npm test`             | all pass            |

## Scope

**In scope** (the only files you should modify):
- `web/src/legal.ts` (rewrite `dayOfYear` to the non-leap convention)
- `web/src/main.ts` (line ~113 only — the date-input default)
- `web/src/legal.test.ts` (update the marked characterization case; add cases)

**Out of scope** (do NOT touch):
- `pipeline/normalize.py` — it is the convention being matched, not changed.
- `web/src/export.ts` `today()` — already correct; reusing it would create a
  cross-module import for three lines; leave both as-is.
- `selectedDoy()` in `main.ts` — already correct.
- Anything in plan 005's territory (`classes`/window schema).

## Git workflow

`main` auto-deploys to production — **never commit to `main`; branch + PR.**

- Branch: `advisor/004-local-date-doy`
- Commit style: imperative sentence, e.g. "Default the date picker to local
  time and match the pipeline's non-leap day-of-year".
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Rewrite `dayOfYear` in `web/src/legal.ts` to the non-leap convention

Replace the function (and its doc comment) with a month-table implementation
mirroring the pipeline:

```ts
// Cumulative day-of-year for the 1st of each month (non-leap); index 1..12.
// MUST match _MONTH_START in pipeline/normalize.py — the tiles encode season
// windows with this table, so the frontend has to count days the same way.
// Feb 29 intentionally maps to 60 (== Mar 1), same as the pipeline.
const MONTH_START = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/** Day-of-year (1..365, non-leap convention) for a JS Date, in local time. */
export function dayOfYear(d: Date): number {
  return MONTH_START[d.getMonth() + 1] + d.getDate();
}
```

Also update the module header comment (`legal.ts:1-9`) if it mentions 366:
`open_start`/`open_end` remain "day-of-year 1..366" in the *data* doc only if
that's what it says — actually the header says `1..366`; change both mentions
to `1..365 (non-leap convention)` so the contract is stated correctly.

**Verify**: `cd web && npx tsc --noEmit` → exit 0.

### Step 2: Default the date input to the local date

In `web/src/main.ts` (line ~113), replace:

```ts
dateInput.value = new Date().toISOString().slice(0, 10);
```

with a local-date formatter matching the pattern of `export.ts` `today()`:

```ts
// Local date, not toISOString(): in the evening (UTC is past midnight) the
// default must still be *today* here — "the night before" is the primary use.
const now = new Date();
dateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
```

(Inline or as a small local function — match surrounding style; keep the
comment.)

**Verify**: `cd web && npx tsc --noEmit` → exit 0.

### Step 3: Update and extend the tests

In `web/src/legal.test.ts`:

1. Flip the marked characterization case: `dayOfYear(new Date(2028, 11, 31))`
   now expects **365** (was 366). Remove the "plan 004 will change this"
   comment; replace with "non-leap convention — must match
   pipeline/normalize.py \_MONTH_START".
2. Add: `dayOfYear(new Date(2028, 1, 29)) === 60` (Feb 29 → Mar 1's value)
   and `dayOfYear(new Date(2028, 2, 1)) === 60`.
3. Add: `dayOfYear(new Date(2026, 4, 1)) === 121` (matches the pipeline's
   `parse_window("05/01-...")` start — cross-convention anchor).
4. Add an integration-flavored case using the expression evaluator from plan
   002: a route with `open_start: 121, open_end: 365, season: "seasonal"` is
   OPEN for `dayOfYear(new Date(2028, 11, 31))` — the exact bug this plan
   fixes.

**Verify**: `cd web && npm test` → all pass.

## Test plan

Step 3 above. Net: one characterization assertion flipped (expected), ≥4 new
assertions. `uv run pytest` must remain untouched and green (nothing on the
Python side changes).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "toISOString" web/src/main.ts` returns no matches
- [ ] `grep -n "MONTH_START" web/src/legal.ts` returns matches
- [ ] `cd web && npx tsc --noEmit` exits 0
- [ ] `cd web && npm test` exits 0
- [ ] `uv run pytest` exits 0 (unchanged Python side still green)
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `web/src/legal.test.ts` does not exist (plan 002 has not landed — this
  plan depends on it).
- The `dayOfYear` or `dateInput.value` excerpts don't match the live code
  beyond plans 001/002's expected drift.
- Any test other than the marked characterization case fails after your
  change — that signals a semantics mistake, not expected drift.

## Maintenance notes

- The non-leap table now exists in two places by design (`legal.ts`,
  `normalize.py`) with cross-referencing comments; a reviewer changing either
  must change both. Plan 005 (per-class windows) keeps this convention — its
  executor should not "fix" the table back to real calendars.
- If the pipeline ever moves to real dates (e.g. ISO date strings in tiles),
  delete both tables together and re-derive tests.
- Reviewer should scrutinize: `selectedDoy()` untouched; no timezone library
  added for what three lines of `getFullYear/getMonth/getDate` solve.
