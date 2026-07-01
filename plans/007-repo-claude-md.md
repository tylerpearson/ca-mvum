# Plan 007: Add a repo CLAUDE.md so every agent session knows the deploy rules, commands, and conventions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `ls CLAUDE.md 2>/dev/null` — if a repo-root
> `CLAUDE.md` already exists, STOP and report (someone created one since this
> plan was written; reconcile instead of overwriting).

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (if plans 002/006 have landed, include their commands/
  facts as noted in Step 1)
- **Category**: dx
- **Planned at**: commit `ea0a597`, 2026-07-01

## Why this matters

This repo is maintained through agent-driven PRs, and its two most dangerous
facts live nowhere an agent reliably reads: **`main` auto-deploys straight to
production** (Cloudflare Pages Git integration — a direct commit to `main` is
a deploy), and **the app and its tiles ship through two different channels**
(app via Pages, `routes.pmtiles` via a GitHub Action to R2). Today those
facts are scattered across the README's Deploy section, a workflow comment,
and one advisor's private memory. A repo-root `CLAUDE.md` puts them in every
future agent session's context, plus the exact build/test commands and the
cross-file couplings that are easy to violate (`DATA_VINTAGE` mirrored in two
files; the non-leap day-of-year table mirrored in two languages).

## Current state

- No `CLAUDE.md` or `AGENTS.md` exists at the repo root (there is a
  `.claude/` directory containing only a `worktrees` entry — leave it alone).
- Source facts to draw from (verify each still holds while writing):
  - README "Deploy": live at `https://ca-mvum.typearson.dev`, Cloudflare
    Pages Git auto-deploy, every push to `main` builds and ships; tiles in R2
    bucket `ca-mvum-tiles` at `https://tiles.ca-mvum.typearson.dev`, uploaded
    by `.github/workflows/deploy-tiles.yml` when `routes.pmtiles` changes.
  - `Makefile`: `fetch` / `normalize` / `tiles` / `data` / `web-install` /
    `dev` / `build` (+ `test` if plan 002 landed).
  - `web/package.json`: `npm run dev|build|preview` (+ `test` after 002);
    build = `tsc --noEmit && vite build`.
  - Python runs via uv: `uv run python -m pipeline.<module>`, Python ≥3.12.
  - Couplings: `DATA_VINTAGE` in `web/src/config.ts` mirrors the text in
    `web/index.html` (`#data-vintage`); the non-leap `_MONTH_START` table in
    `pipeline/normalize.py` is mirrored in `web/src/legal.ts` (after plan
    004); route-layer additions in `web/src/style.ts` must be propagated to
    consumers in `main.ts` / `fire.ts` / `export.ts` / `weather.ts` (plan 001).
  - Intent docs: `PRODUCT.md` (users, product promise), `DESIGN.md` (visual
    system), `docs/r2-range-requests-plan.md` (tile-hosting ADR, status DONE).
  - `plans/README.md` — the execution index for advisor plans.

## Commands you will need

| Purpose      | Command                        | Expected on success |
|--------------|--------------------------------|---------------------|
| Sanity build | `cd web && npm run build`      | exit 0              |
| Tests (if 002 landed) | `make test`           | exit 0              |

## Scope

**In scope** (the only file you should create):
- `CLAUDE.md` (repo root)

**Out of scope** (do NOT touch):
- `README.md` — human-facing; don't dedupe it against CLAUDE.md.
- `.claude/` directory contents.
- Any source file.

## Git workflow

`main` auto-deploys to production — **never commit to `main`; branch + PR.**

- Branch: `advisor/007-claude-md`
- Commit style: imperative sentence, e.g. "Add repo CLAUDE.md with deploy
  rules and agent conventions".
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write `CLAUDE.md`

Target ~60–90 lines. Structure and required content (adjust wording freely;
facts must be verified against the current tree, especially which of plans
002/004/006 have landed — check `plans/README.md` status and the files
themselves):

```markdown
# CLAUDE.md

One-paragraph summary: statewide California MVUM web map (MapLibre static
app + Python tile pipeline); the product promise is LEGAL ACCURACY — see
PRODUCT.md.

## Rules that prevent damage

- `main` auto-deploys to production (Cloudflare Pages watches it). NEVER
  commit or push to `main` directly — always branch + PR.
- Two deploy channels: app (HTML/JS) auto-builds from `main` via Pages;
  `web/public/tiles/routes.pmtiles` uploads to R2 via
  `.github/workflows/deploy-tiles.yml` only when that file changes.
- Don't rebuild or commit `routes.pmtiles` casually: it requires the
  gitignored raw data (`make fetch`, network, minutes) + tippecanoe, and a
  rebuild must bump DATA_VINTAGE (two files, see couplings).

## Commands

(build/dev/test table: make targets, npm scripts, uv invocations — exact,
verified. Note `cd web` for npm commands.)

## Cross-file couplings (change one → change all)

- DATA_VINTAGE: `web/src/config.ts` ↔ `web/index.html` (#data-vintage).
- Non-leap day-of-year table: `pipeline/normalize.py` (_MONTH_START) ↔
  `web/src/legal.ts` (MONTH_START).   [include only if plan 004 landed]
- New route layers in `web/src/style.ts` must be added to the consumers in
  `main.ts` (popups), `fire.ts` (intersection), `export.ts`, `weather.ts`.
- Map status colors: `web/src/style.ts` STATUS ↔ legend swatches in
  `web/src/styles.css` (see DESIGN.md).

## Conventions

- TypeScript strict, no framework, small single-purpose modules; comments
  explain WHY. Map paint colors are hex/rgba (MapLibre can't parse OKLCH);
  UI chrome uses OKLCH tokens in styles.css.
- Python ≥3.12 via uv; pipeline modules run as `uv run python -m pipeline.X`.
- Commit messages: imperative sentence, no conventional-commit prefixes.

## Where things are decided

- PRODUCT.md (users/promise), DESIGN.md (visual system),
  docs/r2-range-requests-plan.md (tile hosting ADR),
  plans/README.md (active improvement plans + backlog + rejected findings).
```

**Verify**: every command you list exits 0 when run (run each);
every file path you name exists (`ls` each).

### Step 2: Cross-check against the plan index

Read `plans/README.md`. If plans 002/004/006 are DONE, ensure `make test` /
the MONTH_START coupling / the snow-status element are reflected accurately;
if they're TODO, omit or mark those lines "(planned — see plans/NNN)".

**Verify**: no statement in CLAUDE.md contradicts the current tree
(spot-check: `grep -n "MONTH_START" web/src/legal.ts` matches what you wrote).

## Test plan

Not applicable (documentation file). The verification is Step 1's
run-every-command / ls-every-path check.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `CLAUDE.md` exists at repo root, ≤120 lines
- [ ] It contains the strings "auto-deploys", "branch + PR" (or equivalent
      never-commit-to-main phrasing), "deploy-tiles.yml", and "DATA_VINTAGE"
- [ ] Every command listed in it was executed and exited 0
- [ ] `git status` shows only `CLAUDE.md` added
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A `CLAUDE.md`/`AGENTS.md` already exists (drift check).
- A fact you're about to write can't be verified in the tree (e.g. the
  Makefile targets changed) — reconcile with reality, and if reality is
  ambiguous, report.

## Maintenance notes

- CLAUDE.md is a contract with future agents: when the deploy story, build
  commands, or couplings change, the PR that changes them must update
  CLAUDE.md in the same diff — reviewers should enforce this.
- Keep it under ~120 lines; it loads into every agent session's context.
  Link to PRODUCT.md/DESIGN.md/plans rather than duplicating them.
