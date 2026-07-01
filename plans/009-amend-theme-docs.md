# Plan 009: Amend DESIGN.md and PRODUCT.md to match the shipped light-only theme, recording the decision

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ea0a597..HEAD -- DESIGN.md PRODUCT.md web/src/styles.css`
> If any of these changed since this plan was written, compare the excerpts
> below against the live files before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `ea0a597`, 2026-07-01 (maintainer decided 2026-07-01:
  amend docs, do not build the dark theme)

## Why this matters

`DESIGN.md` and `PRODUCT.md` describe a light **and dark** theme (dark OKLCH
tokens, an Esri World Dark Gray basemap, `prefers-color-scheme` default), but
the shipped app is light-only: the README says "Light-only 'classic
cartographic' theme" (commit `44afc7e`), and `web/src/styles.css` contains
**zero** dark-theme code — no `prefers-color-scheme` query, no dark token
values (verified 2026-07-01: `grep -n "prefers-color-scheme\|dark" web/src/styles.css`
matches only an unrelated word "darken" in a comment). Stale intent docs are
worse than missing ones: they mislead design work, and every future audit
re-flags the contradiction. The maintainer has decided to **amend the docs to
reality** rather than build the dark theme; this plan makes the docs truthful
and records the decision so it reads as settled, not forgotten.

## Current state

`DESIGN.md` passages that are wrong today:

- Line 4-6 (header): "Theme: light + dark, default follows
  `prefers-color-scheme`."
- Lines 15-24 (color-token table): has both a "Light" and a "Dark" column of
  OKLCH values; the Dark values exist nowhere in code.
- Lines 70-74 ("Basemaps"): "- Dark: **Esri World Dark Gray** base +
  reference labels. The theme toggle swaps basemap + chrome together." —
  there is no theme toggle.

`PRODUCT.md` passages that are wrong today (lines 66-74, "Accessibility &
Inclusion"):

- "Target WCAG 2.1 AA in both light and dark themes" — both mentions of dual
  themes.
- "Readable in bright sun and in the dark — both themes hit contrast targets"
  (line 63-64, Design Principles).
- "Default theme follows `prefers-color-scheme`." (line 74).

What stays true and must NOT be weakened: the WCAG 2.1 AA target, contrast
ratios, the never-color-alone route-status encoding, and
`prefers-reduced-motion` support — all of those are real and implemented.

README context (already correct — the model for tone): "Light-only 'classic
cartographic' theme: the USGS topo basemap is desaturated to a gray pencil
sheet …".

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Confirm no dark CSS | `grep -n "prefers-color-scheme" web/src/styles.css` | no matches |
| Confirm no toggle | `grep -rn "theme" web/src/*.ts web/index.html` | no theme-toggle code (only unrelated `theme-color` meta) |

## Scope

**In scope** (the only files you should modify):
- `DESIGN.md`
- `PRODUCT.md`

**Out of scope** (do NOT touch):
- `web/src/styles.css` and all code — nothing is being built or removed.
- `README.md` — already accurate.
- The accessibility *requirements* themselves — reframe to light-only, never
  delete a target.

## Git workflow

`main` auto-deploys to production — **never commit to `main`; branch + PR.**
(Doc-only changes still trigger a Pages rebuild; harmless.)

- Branch: `advisor/009-theme-docs`
- Commit style: imperative sentence, e.g. "Docs: record the light-only theme
  decision in DESIGN.md and PRODUCT.md".
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Amend `DESIGN.md`

1. Header (line ~5): "Theme: light + dark, default follows
   `prefers-color-scheme`." → "Theme: **light-only** — a deliberate decision,
   see 'Theme decision' below."
2. Color-token table (lines ~17-24): drop the "Dark" column, keeping the
   light OKLCH values as the single value column.
3. "Basemaps" section (lines ~70-74): remove the Dark/Esri bullet and the
   theme-toggle sentence; keep the USGS Topo bullet as the sole basemap.
4. Add a short "## Theme decision" section (place it after "Theme & strategy")
   recording, in 3-5 sentences: the app shipped light-only (commit `44afc7e`);
   rationale — the design is anchored to the desaturated USGS topo sheet,
   which has no dark counterpart with equivalent cartographic quality, and the
   field context (sun glare) makes the light sheet the primary surface;
   decided 2026-07-01 to amend docs rather than build dark; revisit only if
   night-time field use becomes a real demand, in which case the removed
   dark-token column can be recovered from git history at `ea0a597`.
5. Sweep the rest of the file for any other "both themes"/"dark" phrasing and
   align it (e.g. the intro line 5 area).

**Verify**: `grep -in "dark" DESIGN.md` → matches only inside the "Theme
decision" section.

### Step 2: Amend `PRODUCT.md`

1. Design Principles, "Legible in the field" (lines ~63-65): "Readable in
   bright sun and in the dark — both themes hit contrast targets" → keep the
   field-legibility principle but drop the dual-theme claim, e.g. "Readable
   in bright sun — the light theme hits AA contrast targets and the map stays
   scannable at a glance."
2. Accessibility section (lines ~66-74): "in both light and dark themes" →
   "in the light theme (the app is deliberately light-only — see DESIGN.md
   'Theme decision')". Delete the final sentence "Default theme follows
   `prefers-color-scheme`." Keep every ratio, the color-independence rule,
   and the `prefers-reduced-motion` requirement verbatim.

**Verify**: `grep -in "dark\|prefers-color-scheme" PRODUCT.md` → no matches
(or only a pointer to DESIGN.md's Theme decision, if you phrased it that way).

### Step 3: Consistency read-through

Read both amended files top to bottom once; confirm no sentence still implies
a theme toggle, dark tokens, or dual-theme testing. Confirm the README's
Design section (lines ~72-79) agrees with the amended docs (it should —
unchanged).

**Verify**: report a one-line confirmation per file.

## Test plan

Not applicable (docs only). The greps in Steps 1-2 are the gates.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -in "dark" DESIGN.md` matches only within the "Theme decision" section
- [ ] `grep -in "prefers-color-scheme" DESIGN.md PRODUCT.md` → no matches
- [ ] `grep -c "Theme decision" DESIGN.md` ≥ 1
- [ ] WCAG/contrast/reduced-motion requirements still present in PRODUCT.md
      (`grep -in "WCAG\|reduced-motion" PRODUCT.md` → matches)
- [ ] `git status` shows only `DESIGN.md` and `PRODUCT.md` modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `grep -n "prefers-color-scheme" web/src/styles.css` returns matches — dark
  CSS exists after all, and the premise of this plan is wrong.
- The DESIGN.md/PRODUCT.md excerpts don't match the live files (drift).
- You feel the need to change any file other than the two in scope.

## Maintenance notes

- If the dark theme is ever revisited, start from the "Theme decision"
  section's pointer: the full dark spec (tokens + Esri basemap) lives in git
  history at `ea0a597`; don't redesign from scratch.
- `plans/README.md` should move the "Dark theme" direction item to resolved
  when this lands (the executor updating the status row should do it).
