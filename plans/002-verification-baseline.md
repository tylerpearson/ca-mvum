# Plan 002: Establish a verification baseline — unit tests for the legal-accuracy core (web + pipeline) and a CI workflow

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ea0a597..HEAD -- web/src/legal.ts web/src/config.ts pipeline/normalize.py pipeline/forests.py web/package.json pyproject.toml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. Exception: plan 001 legitimately
> adds `web/src/escape.ts` — if it exists, include the test for it below.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (001 recommended first; see drift-check exception)
- **Category**: tests
- **Planned at**: commit `ea0a597`, 2026-07-01

## Why this matters

This project's entire product promise is **legal accuracy**: "is this route
legally open to *my* vehicle on *this* date?" (see `PRODUCT.md`). The code
that answers that — season-window parsing in `pipeline/normalize.py` and the
MapLibre filter expressions in `web/src/legal.ts` — currently has **zero
tests**. The only repo-wide verification is `tsc --noEmit`. Two upcoming plans
(004: date/leap-year fixes, 005: per-class season windows) rewrite exactly
this code; without characterization tests first, those are blind refactors.
This plan creates the one-command verification story for both halves of the
repo and wires it into CI on pull requests (the maintainer works exclusively
via PRs; `main` auto-deploys).

## Current state

- **No test framework anywhere.** `web/package.json` scripts are only
  `dev`/`build`/`preview`; `pyproject.toml` has only runtime deps
  (`httpx`, `shapely`), no dev group, no pytest config. There is no `tests/`
  directory and no `*.test.ts` file (verify: `ls tests/ 2>/dev/null` fails;
  `find web/src -name '*.test.ts'` is empty).
- **Python is managed by uv** (`uv.lock` present, `requires-python >=3.12`,
  `.venv/` exists). Pipeline modules run as `uv run python -m pipeline.<mod>`.
- **Web** is Vite 6 + TypeScript 5.7 strict, no framework.
  `web/tsconfig.json` has `"include": ["src"]`, `"types": ["vite/client"]`,
  `noUnusedLocals`/`noUnusedParameters` on.
- **CI**: only `.github/workflows/deploy-tiles.yml` exists (R2 tile upload).
  Its conventions to match: actions pinned to full commit SHAs with a
  version comment, top-level `permissions: contents: read`, explanatory
  header comment.

What to test, as it exists today:

`web/src/legal.ts` (50 lines, pure functions returning MapLibre expressions):

```ts
// legal.ts:13-17
export function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}
// legal.ts:22-27  classPermitted(tokens): ANY-of ["in", ",<t>,", ["get","classes"]]
// legal.ts:30-45  dateInSeason(doy): yearlong -> true; else window check,
//                 with a wrapping branch when open_end < open_start
// legal.ts:48-50  isOpen(tokens, doy): ["all", classPermitted, dateInSeason]
```

The expressions consume feature properties written by
`pipeline/normalize.py`: `classes` (comma-delimited, e.g. `",passenger,atv,"`),
`season` (`"yearlong" | "seasonal"`), `open_start`/`open_end` (day-of-year
ints, non-leap convention).

`pipeline/normalize.py` (the functions to pin down):

```python
# normalize.py:78-80
def _doy(month: int, day: int) -> int:  # non-leap month table (_MONTH_START)
# normalize.py:87-106
def parse_window(raw) -> tuple[int, int] | None:
    #  blank -> None (class not permitted)
    #  "open"/"yearlong"/... -> (1, 365)
    #  "MM/DD-MM/DD" -> (_doy(m1,d1), _doy(m2,d2))
    #  present-but-unparseable -> (1, 365)
# normalize.py:109-154
def normalize_feature(props: dict) -> dict | None:
    #  builds `classes`, picks ONE representative window =
    #  most common bounded window among permitted classes (Counter),
    #  season = "seasonal" iff any bounded window exists; None if no class allowed
# normalize.py:157-167  _window_text / _doy_to_md
```

`pipeline/forests.py:30-33` — `slug()` (trivial, worth one test).

**Key technique for the web tests**: MapLibre expressions can be evaluated
without a map via `@maplibre/maplibre-gl-style-spec`:

```ts
import { expression } from "@maplibre/maplibre-gl-style-spec";
const res = expression.createExpression(isOpen(["passenger"], 200));
if (res.result === "error") throw new Error("invalid expression");
const value = res.value.evaluate(
  { zoom: 10 },
  { type: "LineString", properties: { classes: ",passenger,", season: "seasonal", open_start: 121, open_end: 319 } } as never,
);
```

This tests the *semantics* the map actually applies, not the expression's
array shape. (If the `evaluate` feature-argument typing fights you, cast the
feature object to `never` or `any` in the test file only — test files may
relax strictness locally; source files may not.)

## Commands you will need

| Purpose            | Command                          | Expected on success |
|--------------------|----------------------------------|---------------------|
| Web install        | `cd web && npm install`          | exit 0              |
| Web typecheck      | `cd web && npx tsc --noEmit`     | exit 0              |
| Web tests (new)    | `cd web && npm test`             | all pass            |
| Python deps        | `uv sync`                        | exit 0              |
| Python tests (new) | `uv run pytest`                  | all pass            |

## Scope

**In scope** (the only files you should modify/create):
- `web/package.json` (add `vitest` + `@maplibre/maplibre-gl-style-spec`
  devDependencies, add `"test": "vitest run"` script), `web/package-lock.json`
- `web/src/legal.test.ts` (create)
- `web/src/escape.test.ts` (create ONLY if `web/src/escape.ts` exists — plan 001)
- `pyproject.toml` (add `[dependency-groups] dev = ["pytest>=8"]` and
  `[tool.pytest.ini_options] testpaths = ["tests"]`), `uv.lock`
- `tests/__init__.py` (create, empty), `tests/test_normalize.py` (create),
  `tests/test_forests.py` (create)
- `.github/workflows/ci.yml` (create)
- `Makefile` (add a `test` target)

**Out of scope** (do NOT touch):
- Any behavior change in `web/src/legal.ts`, `pipeline/normalize.py`, or any
  other source file. This plan **characterizes current behavior**, including
  behavior other plans will change — that's intentional.
- `web/src/export.ts` / `weather.ts` internals (their pure helpers are
  module-private; do not export them just to test them — deferred).
- `.github/workflows/deploy-tiles.yml`.

## Git workflow

`main` auto-deploys to production — **never commit to `main`; branch + PR.**

- Branch: `advisor/002-verification-baseline`
- Commit style: imperative sentence, e.g. "Add vitest + pytest baseline and CI".
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add vitest to the web app

In `web/package.json` add devDependencies `"vitest": "^3.0.0"` and
`"@maplibre/maplibre-gl-style-spec": "^23.0.0"`, and script
`"test": "vitest run"`. Then `cd web && npm install`.

If npm reports no matching version for either package, run
`npm view <pkg> version` and use the current major instead — then note the
substitution in your report.

**Verify**: `cd web && npx vitest --version` → prints a version, exit 0.

### Step 2: Write `web/src/legal.test.ts`

Evaluate real expression semantics using the `createExpression` technique
from "Current state". A small local helper keeps cases terse:

```ts
function evalOpen(tokens: string[], doy: number, props: Record<string, unknown>): boolean
```

Cases (each a separate `it`):

1. **dayOfYear**: `dayOfYear(new Date(2026, 0, 1)) === 1`;
   `dayOfYear(new Date(2026, 11, 31)) === 365`;
   `dayOfYear(new Date(2028, 11, 31)) === 366` — leap year. **Mark this last
   one with a comment**: it characterizes the CURRENT (mismatched) behavior;
   plan 004 changes it to the pipeline's non-leap convention (365) and must
   update this assertion.
2. **classPermitted**: `",passenger,"` matches token `passenger`; does NOT
   match `atv`; multi-token profile (`["passenger","high_clearance"]`)
   matches a route with only `",high_clearance,"`.
3. **Substring safety**: token `atv` must NOT match `classes: ",utv_atv_x,"`
   — actually verify what the delimited `,atv,` pattern does and assert it;
   the delimiters exist precisely to prevent bare-substring hits.
4. **dateInSeason yearlong**: `season: "yearlong"` is open at doy 1 and 366
   regardless of window fields.
5. **Normal window**: `open_start: 121, open_end: 319` (May 1–Nov 15,
   non-leap) → open at 121, 200, 319; closed at 120 and 320.
6. **Wrapping (winter) window**: `open_start: 305, open_end: 90` → open at
   306, 366, 1, 89; closed at 200.
7. **isOpen combined**: permitted-but-out-of-season → false;
   in-season-but-not-permitted → false; both → true.
8. If `web/src/escape.ts` exists: `esc('&<>"\'')` returns
   `&amp;&lt;&gt;&quot;&apos;` (in `web/src/escape.test.ts`).

**Verify**: `cd web && npm test` → all tests pass.
**Verify**: `cd web && npx tsc --noEmit` → exit 0 (test files are inside
`src/`, so they're typechecked; if `vitest` globals aren't found, import
`describe/it/expect` from `"vitest"` explicitly — do not enable globals).

### Step 3: Add pytest to the Python side

In `pyproject.toml` append:

```toml
[dependency-groups]
dev = ["pytest>=8"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

Run `uv sync` (uv installs the dev group by default), create `tests/__init__.py`.

**Verify**: `uv run pytest --version` → prints version, exit 0.

### Step 4: Write `tests/test_normalize.py` and `tests/test_forests.py`

`tests/test_normalize.py` — import from `pipeline.normalize`:

1. **parse_window**: `None`/`""`/`"  "` → `None`; `"open"`, `"Yearlong"`,
   `"year long"` → `(1, 365)`; `"05/01-11/15"` → `(121, 319)`;
   `"01/01-12/31"` → `(1, 365)`; garbage like `"see ranger"` → `(1, 365)`
   (present-but-unparseable = permitted yearlong — current documented policy).
2. **_doy**: `_doy(1,1) == 1`, `_doy(12,31) == 365`, `_doy(3,1) == 60`
   (non-leap convention).
3. **_window_text / _doy_to_md**: `(1,365)` → `"Yearlong"`;
   `(121,319)` → `"05/01-11/15"`.
4. **normalize_feature** with synthetic props dicts:
   - no `*_datesopen` fields set → returns `None`;
   - `{"passengervehicle_datesopen": "open"}` → `classes == ",passenger,"`,
     `season == "yearlong"`, window `(1, 365)`;
   - passenger `"open"` + motorcycle `"05/01-11/15"` → `classes` contains
     both tokens, `season == "seasonal"`, `open_start == 121`,
     `open_end == 319`. **Comment this case**: it characterizes the
     representative-window collapse (the whole route reads seasonal even for
     the yearlong passenger class); plan 005 changes this and must update it.
   - e-bike gate: `{"passengervehicle_datesopen": "open", "e_bike_class1": "yes"}`
     → `classes` contains `e_bike1`; value `"no"` → does not.
   - `miles` rounding: `{"passengervehicle_datesopen": "open", "gis_miles": 1.234}`
     → `miles == 1.23`; missing `gis_miles` → `0.0`.

`tests/test_forests.py`: `slug("San Bernardino National Forest") == "san-bernardino"`;
`slug("Humboldt-Toiyabe National Forest") == "humboldt-toiyabe"`.

Do not import `pipeline.fetch_mvum` or anything that performs network I/O.

**Verify**: `uv run pytest` → all pass, 0 skipped due to errors.

### Step 5: Add a `make test` target

In `Makefile`, add to `.PHONY` and:

```make
test:
	uv run pytest
	cd web && npm test
```

Also add a `make help` line describing it, matching the existing help format.

**Verify**: `make test` → both suites run and pass, exit 0.

### Step 6: Create `.github/workflows/ci.yml`

Match the conventions of `.github/workflows/deploy-tiles.yml`: explanatory
header comment, `permissions: contents: read`, actions pinned to full commit
SHAs with a `# vN` comment. Shape:

- Trigger: `pull_request` (all branches) and `push` to `main`.
- Job `web`: checkout (same pinned SHA as deploy-tiles.yml:
  `actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4`),
  `actions/setup-node` pinned to a current v4 commit SHA (resolve the SHA via
  `git ls-remote https://github.com/actions/setup-node refs/tags/v4*` or the
  GitHub UI; do NOT use a mutable tag) with `node-version: 22` and
  `cache: npm` / `cache-dependency-path: web/package-lock.json`; then
  `cd web && npm ci && npx tsc --noEmit && npm test`.
- Job `pipeline`: checkout (same SHA), `astral-sh/setup-uv` pinned to a
  current commit SHA, then `uv sync --locked && uv run pytest`.

**Verify**: `uv run python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"`
→ exit 0. (If PyYAML isn't in the env, use
`uv run --with pyyaml python -c ...`.) Actual CI execution is verified on the
eventual PR — note that in your report.

## Test plan

This plan *is* the test plan. Expected totals: ≥8 web test cases across
`legal.test.ts` (+1 file if `escape.ts` exists), ≥12 Python assertions across
two test files. All green via `make test`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd web && npm test` exits 0 with ≥8 passing tests
- [ ] `uv run pytest` exits 0 with ≥8 passing tests
- [ ] `make test` exits 0
- [ ] `cd web && npx tsc --noEmit` exits 0
- [ ] `.github/workflows/ci.yml` exists, YAML-parses, and contains no mutable
      action tags (`grep -E 'uses:.*@(v[0-9]|main|master)' .github/workflows/ci.yml`
      returns no matches)
- [ ] No source-behavior changes: `git diff --stat -- web/src/legal.ts pipeline/normalize.py pipeline/forests.py` is empty
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `createExpression` from `@maplibre/maplibre-gl-style-spec` cannot evaluate
  the expressions from `legal.ts` (API drift) after one honest attempt at the
  documented API — do not fall back to asserting raw array shapes without
  reporting.
- Any characterization test FAILS against current behavior — that means the
  documented behavior in this plan is wrong; report the discrepancy rather
  than "fixing" source code to match the test.
- `uv sync` or `npm install` cannot reach the network/registry.
- You find yourself wanting to modify `legal.ts` or `normalize.py`.

## Maintenance notes

- Plans 004 and 005 intentionally break specific characterization assertions
  (marked with comments in the tests). Their executors update those tests as
  part of their plans — reviewers should reject any *other* test edits there.
- When adding a new `*_datesopen` format to `parse_window`, add the case to
  `test_normalize.py` first.
- CI runs `npm ci`, so `web/package-lock.json` must stay committed and in sync.
- Deferred: exporting and testing `export.ts`'s `groupRoutes`/`buildGpx`
  helpers (would require making them public); do it if export bugs ever show up.
