# Plan 008: Automate the MVUM data refresh — vintage stamping in the pipeline and a scheduled refresh workflow that opens a PR

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ea0a597..HEAD -- pipeline/build_tiles.py web/src/config.ts web/index.html .github/workflows/`
> Plan 006 legitimately edits `web/index.html` (social meta + snow status) and
> plan 002 adds `.github/workflows/ci.yml`. Compare the excerpts below against
> the live code; if `build_tiles.py` or the `DATA_VINTAGE` lines differ,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (a scheduled workflow that changes data and opens PRs; kept
  safe by never auto-merging)
- **Depends on**: plans/002-verification-baseline.md (pytest infrastructure
  for the stamping tests)
- **Category**: dx / direction
- **Planned at**: commit `ea0a597`, 2026-07-01

## Why this matters

The route data is only as fresh as the last manual `make data` run, and the
freshness label is maintained by hand in **two** places. `web/src/config.ts:68-71`
says "The pipeline should update this on each `make tiles`" — but nothing
does; `web/index.html` carries a second hand-mirrored copy. Forest Service
MVUMs get reissued; a map whose core promise is legal accuracy silently rots
without a refresh loop. Half the automation already exists —
`.github/workflows/deploy-tiles.yml` uploads the tile file to R2 whenever a
push to `main` changes it. This plan builds the other half: (a) the pipeline
stamps `DATA_VINTAGE` into both files automatically, and (b) a monthly
scheduled workflow runs the full pipeline and opens a PR when the tiles
actually changed. The maintainer reviews and merges; merge triggers the
existing R2 upload and Pages deploy. No step auto-publishes data.

## Current state

**The stamp targets.** `web/src/config.ts:67-71`:

```ts
/** MVUM tile build date — the point-in-time vintage of the route data baked
 *  into routes.pmtiles. Unlike the live fire/smoke/AQI/snow overlays, routes are
 *  only as fresh as the last pipeline run, so surface this to users. The pipeline
 *  should update this on each `make tiles`. Mirrored in index.html (#data-vintage). */
export const DATA_VINTAGE = "June 2026";
```

`web/index.html:108-109`:

```html
      <!-- "June 2026" mirrors DATA_VINTAGE in src/config.ts; keep them in sync. -->
      <p id="data-vintage" class="data-vintage">MVUM route data current as of <strong>June 2026</strong>.</p>
```

**The stamper's home.** `pipeline/build_tiles.py` (62 lines): checks for
tippecanoe, runs it on `data/ca-normalized.geojson` →
`web/public/tiles/routes.pmtiles`, prints the size on success (lines 54-58):

```python
    result = subprocess.run(cmd)
    if result.returncode == 0:
        size_mb = DST.stat().st_size / 1e6
        print(f"\nWrote {DST.relative_to(ROOT)} ({size_mb:.1f} MB).")
    return result.returncode
```

**Workflow conventions** (`.github/workflows/deploy-tiles.yml`): header
comment explaining why, actions pinned to full commit SHAs with `# vN`
comments, least-privilege `permissions`, checkout pinned at
`actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4`.

**Pipeline runtime facts**: `make data` = fetch (network, ~minutes, paginated
USFS ArcGIS pulls) → normalize (needs `httpx`, `shapely` via uv; also fetches
the CA boundary once) → tiles (needs **tippecanoe**, not preinstalled on
GitHub runners; build from source — see Step 3). `make fetch` returns exit 1
if any forest fails (`fetch_mvum.py:151-155`) — the workflow must respect
that and NOT open a PR on partial data.

**Testing conventions** (from plan 002): pytest in `tests/`, run via
`uv run pytest`; no network in tests.

## Commands you will need

| Purpose          | Command                        | Expected on success |
|------------------|--------------------------------|---------------------|
| Python tests     | `uv run pytest`                | all pass            |
| Import sanity    | `uv run python -c "import pipeline.build_tiles"` | exit 0 |
| YAML check       | `uv run --with pyyaml python -c "import yaml; yaml.safe_load(open('.github/workflows/data-refresh.yml'))"` | exit 0 |
| Full local run (OPERATOR ONLY) | `make data`      | new tiles + stamped vintage |

## Scope

**In scope** (the only files you should modify/create):
- `pipeline/build_tiles.py` (add the stamping function + call)
- `tests/test_build_tiles.py` (create)
- `.github/workflows/data-refresh.yml` (create)
- `web/src/config.ts` / `web/index.html` — **only** as targets of the
  stamping *code path*; do not hand-edit the vintage strings in this plan.

**Out of scope** (do NOT touch):
- `.github/workflows/deploy-tiles.yml` — already correct; it fires on merge.
- `pipeline/fetch_mvum.py`, `pipeline/normalize.py`, `Makefile`.
- Any auto-merge mechanism — the refresh PR is always human-reviewed.
- `web/public/tiles/routes.pmtiles` — never rebuild/commit tiles yourself.

## Git workflow

`main` auto-deploys to production — **never commit to `main`; branch + PR.**

- Branch: `advisor/008-data-refresh-automation`
- Commit style: imperative sentence, e.g. "Stamp DATA_VINTAGE from the tile
  build and add a scheduled refresh PR workflow".
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a `stamp_vintage` function to `pipeline/build_tiles.py`

Add a pure-ish function the tests can exercise with temp files:

```python
CONFIG_TS = ROOT / "web" / "src" / "config.ts"
INDEX_HTML = ROOT / "web" / "index.html"

def stamp_vintage(vintage: str, config_path: Path = CONFIG_TS,
                  html_path: Path = INDEX_HTML) -> None:
    """Rewrite the DATA_VINTAGE constant and its index.html mirror.

    Anchored, minimal regex replacements; raises RuntimeError if either
    pattern is not found exactly once (so a refactor of either file fails the
    build loudly instead of silently un-syncing the vintage).
    """
```

Implementation requirements:

- `config.ts` pattern: `export const DATA_VINTAGE = "<anything>";` →
  replace the quoted value with `vintage`.
- `index.html` pattern: `current as of <strong><anything></strong>` →
  replace the strong-tag content with `vintage`.
- Use `re.subn` and assert `count == 1` for each file; on any other count,
  raise `RuntimeError` naming the file and pattern.
- In `main()`, after the success branch (`result.returncode == 0`), compute
  `vintage = datetime.now().strftime("%B %Y")` (e.g. "July 2026") and call
  `stamp_vintage(vintage)`, printing what was stamped. Do this **only** on
  tippecanoe success.
- Update the stale sentence in `web/src/config.ts`'s doc comment — it
  currently says "The pipeline **should** update this"; the stamper may
  rewrite only the constant line, so hand-edit that comment? No — the comment
  edit is one line and belongs to this change: adjust it via the normal edit
  (not the stamper) to "Updated automatically by pipeline/build_tiles.py on
  each `make tiles`." Same for the `index.html` comment on line ~108
  ("keep them in sync" → "stamped by pipeline/build_tiles.py").

**Verify**: `uv run python -c "import pipeline.build_tiles"` → exit 0.
`git diff web/src/config.ts web/index.html` shows ONLY the two comment-line
edits (constant values unchanged — you didn't run the pipeline).

### Step 2: Test the stamper

Create `tests/test_build_tiles.py` (pytest, `tmp_path` fixtures — write
minimal fake `config.ts` / `index.html` files containing the real patterns
copied from the excerpts above):

1. Happy path: both files stamped to "July 2026"; other lines untouched.
2. Idempotent: stamping twice leaves one, correct value.
3. Missing pattern in `config.ts` → `RuntimeError` naming the file.
4. Pattern appearing twice in `index.html` → `RuntimeError`.
5. Real-file smoke: `stamp_vintage` against copies of the actual
   `web/src/config.ts` and `web/index.html` (copy into `tmp_path` first —
   never stamp the repo's live files from a test) succeeds with count 1 each.

**Verify**: `uv run pytest` → all pass, including 5 new tests.

### Step 3: Create `.github/workflows/data-refresh.yml`

Match `deploy-tiles.yml` conventions (header comment, SHA-pinned actions,
least privilege). Shape:

- **Triggers**: `schedule: cron: "17 14 1 * *"` (monthly, 1st, 14:17 UTC —
  offset minutes to be polite to shared cron load) + `workflow_dispatch: {}`.
- **Permissions** (job-level): `contents: write`, `pull-requests: write`
  (required to push the refresh branch and open the PR; note the deviation
  from deploy-tiles' read-only in the header comment).
- **Guard**: `if: github.repository == 'OWNER/REPO'` — read the actual
  `owner/name` from `git remote get-url origin` and hardcode it (prevents
  forks from running the schedule).
- Steps:
  1. Checkout (`actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4`).
  2. Install uv (`astral-sh/setup-uv` pinned to a full commit SHA you resolve
     from its repo tags — same rule as plan 002: no mutable tags).
  3. Build tippecanoe from source, pinned to a release tag:
     `sudo apt-get update && sudo apt-get install -y build-essential libsqlite3-dev zlib1g-dev`
     then clone `https://github.com/felt/tippecanoe` at a specific tag
     (check the current release; e.g. `--branch 2.x.x --depth 1`),
     `make -j$(nproc) && sudo make install`.
  4. `make data` — if it exits non-zero (any forest failed), the job fails
     here; no PR is opened on partial data.
  5. Change detection: `git diff --quiet web/public/tiles/routes.pmtiles && echo "no-change" ...`
     — if the tile file is byte-identical, exit 0 successfully with a log
     line, skipping the PR steps (use a step output + `if:` on later steps).
  6. Open the PR: use `peter-evans/create-pull-request` pinned to a full
     commit SHA, with branch `data-refresh/<run date>`, title
     `"MVUM data refresh: <Month YYYY>"`, and a body that includes the
     `make data` summary line counts if easily captured, plus a checklist
     reminding the reviewer to spot-check a few forests. Commit paths:
     `web/public/tiles/routes.pmtiles`, `web/src/config.ts`, `web/index.html`.
     (`data/*.geojson` is gitignored — nothing else should be dirty; the
     action commits only what changed.)
- Header comment must state the safety property: **this workflow never
  merges; a human reviews every refresh PR. Merge then triggers
  deploy-tiles.yml (R2 upload) + Pages (app rebuild) automatically.**

**Verify**:
`uv run --with pyyaml python -c "import yaml; yaml.safe_load(open('.github/workflows/data-refresh.yml'))"`
→ exit 0;
`grep -E 'uses:.*@(v[0-9]|main|master)' .github/workflows/data-refresh.yml`
→ no matches (all SHAs).

### Step 4: OPERATOR HANDOFF (include in your report; do not execute)

The full loop can only be proven on GitHub:

1. Merge this PR, then run the workflow once via **workflow_dispatch** and
   watch it: tippecanoe builds, `make data` completes (~minutes), and either
   a refresh PR appears or the run logs "no-change".
2. Review the refresh PR's map diff locally (`git checkout` the branch,
   `make dev`, spot-check 2–3 forests), then merge; confirm
   `deploy-tiles.yml` fires and production shows the new vintage string.
3. Caveat to check on first run: if the tile file changes byte-wise on every
   rebuild even with identical source data (tippecanoe metadata
   nondeterminism), monthly no-op PRs will appear — if so, file a follow-up
   to hash `data/ca-normalized.geojson` instead of diffing the pmtiles.

## Test plan

Step 2 (5 pytest cases for the stamper). Workflow correctness beyond YAML
validity is verified by the operator's dispatch run (Step 4) — say so in the
PR description.

## Done criteria

Machine-checkable (executor portion — Step 4 is the operator's). ALL must hold:

- [ ] `uv run pytest` exits 0, including ≥5 new stamper tests
- [ ] `grep -n "stamp_vintage" pipeline/build_tiles.py` shows definition +
      one call inside the success branch of `main()`
- [ ] `git diff --stat` for `web/src/config.ts` + `web/index.html` shows
      comment-line changes only; `DATA_VINTAGE` value still `"June 2026"`
- [ ] `.github/workflows/data-refresh.yml` exists, YAML-parses, contains no
      mutable action tags, and contains `workflow_dispatch`
- [ ] `cd web && npx tsc --noEmit` exits 0 (config.ts comment edit is benign)
- [ ] `git status` shows no modified files outside the in-scope list;
      `web/public/tiles/routes.pmtiles` UNMODIFIED
- [ ] `plans/README.md` status row updated (note operator Step 4 pending)

## STOP conditions

Stop and report back (do not improvise) if:

- The `DATA_VINTAGE` or `#data-vintage` excerpts don't match the live files
  (drift — plan 006 touches nearby lines in index.html but not these).
- You cannot resolve a pinned commit SHA for `setup-uv` /
  `create-pull-request` / a tippecanoe release tag — do not fall back to
  mutable tags; report instead.
- You find yourself wanting to run `make data` or commit a rebuilt tile file.
- The stamper's regex would require multiline/DOTALL gymnastics because the
  target lines changed shape — report; the anchored one-line patterns are
  the contract.

## Maintenance notes

- The stamper makes `build_tiles.py` fail loudly if either vintage pattern
  disappears — whoever refactors `config.ts` or the panel HTML must keep the
  patterns or update `stamp_vintage` in the same PR.
- Refresh PRs created with the default `GITHUB_TOKEN` do **not** trigger
  other workflows (GitHub anti-recursion rule) — so plan 002's CI won't run
  on them automatically. Reviewer can trigger CI by pushing an empty commit
  or closing/reopening; if that gets annoying, switch the workflow to a
  fine-grained PAT (documented follow-up, not done here).
- Monthly cadence is a guess at MVUM reissue frequency; tune the cron once a
  few cycles show how often real changes land.
- If tippecanoe source builds get slow/flaky on runners, cache the built
  binary keyed on the pinned tag (actions/cache) — deferred until it hurts.
