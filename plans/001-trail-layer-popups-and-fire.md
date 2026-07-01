# Plan 001: Make trails first-class in route popups and fire intersection, and escape popup HTML

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ea0a597..HEAD -- web/src/main.ts web/src/fire.ts web/src/weather.ts web/src/export.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (+ a small security hardening)
- **Planned at**: commit `ea0a597`, 2026-07-01

## Why this matters

This repo is a MapLibre web map of California National Forest MVUM (Motor
Vehicle Use Map) routes. Open routes are drawn in two layers: open **roads**
(`routes-open`, solid) and open **trails** (`routes-trail`, dashed) — the trail
layer was added later (commit `1eafff4`) and two consumers were never updated:

1. **Tapping an open trail does nothing.** The click/popup handlers in
   `web/src/main.ts` are registered only for the open/closed/affected layers,
   so trails — the routes OHV riders care about most — show no popup, no
   pointer cursor, no link to the official MVUM.
2. **Open trails inside an active wildfire perimeter are never flagged.** The
   fire-intersection check in `web/src/fire.ts` queries only `routes-open`
   (roads). A trail crossing a fire perimeter is neither drawn in warning red
   nor counted in the "⚠ N visible routes inside an active fire perimeter"
   status line. This is a safety-adjacent feature undercounting.

Additionally, `popupHtml()` in `main.ts` interpolates route properties (name,
forest, surface, season text, …) into popup HTML **without escaping** — the
only unescaped HTML sink in the app (`weather.ts` and `export.ts` both escape).
The properties come from USFS data baked into the tiles, so exploitability is
low, but it is third-party data, and a route name containing `&` or `<`
renders wrong today. Fix all three while in this code.

## Current state

Relevant files:

- `web/src/main.ts` — map boot, controls, route-click popups. `popupHtml()` at
  lines 202–223; the popup registration loop at lines 225–236.
- `web/src/fire.ts` — fire perimeters + route intersection. `recomputeAffected()`
  at lines 79–106.
- `web/src/style.ts` — defines `ROUTE_LAYERS = { casing, closed, open, trail, affected }`
  (lines 28–34). No changes here; it's the source of the layer-id constants.
- `web/src/weather.ts` — has a private `esc()` (lines 134–140) escaping
  `& < > "`. Its map-click handler already correctly includes
  `ROUTE_LAYERS.trail` (lines 228–235) — that is the pattern to follow.
- `web/src/export.ts` — has a private `esc()` (lines 34–41) escaping
  `& < > " '`. Its `collect()` already correctly queries
  `[ROUTE_LAYERS.open, ROUTE_LAYERS.trail]` (lines 190–195).

The buggy popup loop, `web/src/main.ts:225`:

```ts
for (const layer of [ROUTE_LAYERS.open, ROUTE_LAYERS.closed, ROUTE_LAYERS.affected]) {
  map.on("click", layer, (e) => {
    ...
```

(`ROUTE_LAYERS.trail` is missing from the array.)

The buggy fire query, `web/src/fire.ts:84-86`:

```ts
  const routes = map.queryRenderedFeatures(undefined, {
    layers: [ROUTE_LAYERS.open],
  }) as MapGeoJSONFeature[];
```

(`ROUTE_LAYERS.trail` is missing from `layers`.)

The unescaped sink, `web/src/main.ts:202-222` (abridged):

```ts
function popupHtml(p: Record<string, unknown>, inFire: boolean): string {
  const title = (p.name as string) || (p.id ? `Route ${p.id}` : "Unnamed route");
  const allowed = String(p.classes ?? "")
    .split(",").filter(Boolean).map((k) => CLASS_LABELS[k] ?? k).join(", ");
  const rows: [string, string][] = [
    ["Forest", String(p.forest ?? "—")],
    ...
  ];
  const body = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  ...
  return `<div class="pop"><h3>${title}</h3>${warn}<dl>${body}</dl>${link}</div>`;
}
```

Repo conventions: TypeScript strict mode, no framework, small single-purpose
modules under `web/src/`, block comments explain *why*. Match the comment
density and style you see in `main.ts`.

## Commands you will need

| Purpose   | Command                          | Expected on success |
|-----------|----------------------------------|---------------------|
| Install   | `cd web && npm install`          | exit 0              |
| Typecheck | `cd web && npx tsc --noEmit`     | exit 0, no output   |
| Build     | `cd web && npm run build`        | exit 0 (`tsc` + vite) |
| Dev server| `cd web && npm run dev`          | Vite serves on :5173 |

## Scope

**In scope** (the only files you should modify):
- `web/src/main.ts`
- `web/src/fire.ts`
- `web/src/escape.ts` (create)
- `web/src/weather.ts` (import swap only — delete its local `esc`, import shared)
- `web/src/export.ts` (import swap only — delete its local `esc`, import shared)

**Out of scope** (do NOT touch, even though they look related):
- `web/src/style.ts` — layer definitions are correct; the bug is in consumers.
- `web/src/legal.ts`, `web/src/config.ts` — other plans own changes there.
- The popup's visual structure/CSS classes (`.pop`, `.pop-warn`, `.pop-link`)
  — `web/src/styles.css` depends on them.

## Git workflow

This repo's `main` auto-deploys to production via Cloudflare Pages —
**never commit directly to `main`; always branch and open a PR.**

- Branch: `advisor/001-trail-popups-fire`
- Commit style (match `git log`): imperative sentence, no conventional-commit
  prefix, e.g. "Include trails in route popups and fire intersection".
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the shared HTML-escape helper

Create `web/src/escape.ts` containing one exported function that escapes the
union of what the two existing private copies handle (`& < > " '`), in this
order (`&` first):

```ts
/** XML/HTML-escape text before it is interpolated into markup. */
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
```

**Verify**: `cd web && npx tsc --noEmit` → exit 0.

### Step 2: Switch weather.ts and export.ts to the shared helper

- In `web/src/weather.ts`: delete the local `esc` function (lines ~134–140,
  including its doc comment) and add `import { esc } from "./escape";`.
- In `web/src/export.ts`: delete the local `esc` function (lines ~34–41,
  including its doc comment) and add `import { esc } from "./escape";`.

No call sites change — both files already call `esc(...)`.

**Verify**: `cd web && npx tsc --noEmit` → exit 0 (strict mode +
`noUnusedLocals` will catch a leftover local copy or unused import).

### Step 3: Escape route properties in popupHtml (main.ts)

In `web/src/main.ts`, import `esc` from `./escape` and apply it in
`popupHtml()` to every string derived from feature properties:

- `title` (wrap at usage: `<h3>${esc(title)}</h3>`),
- each row value `v` in the `rows.map(...)` (`<dd>${esc(v)}</dd>` — the row
  *keys* `k` are hardcoded literals and don't need escaping, but escaping them
  too is harmless),
- the `allowed` string (escape each mapped label/token before `join`, or
  escape the joined result — either is fine).

Do NOT escape the `mvum` URL variable — it is one of two hardcoded constants
from `config.ts` and is used in an `href` attribute; wrapping it in `esc()`
is acceptable but not required.

**Verify**: `cd web && npx tsc --noEmit` → exit 0.

### Step 4: Register popups + cursor for the trail layer

In `web/src/main.ts` line ~225, add `ROUTE_LAYERS.trail` to the loop array:

```ts
for (const layer of [ROUTE_LAYERS.open, ROUTE_LAYERS.trail, ROUTE_LAYERS.closed, ROUTE_LAYERS.affected]) {
```

The `inFire` argument (`layer === ROUTE_LAYERS.affected`) needs no change.

**Verify**: `cd web && npx tsc --noEmit` → exit 0.

### Step 5: Include trails in the fire intersection

In `web/src/fire.ts` `recomputeAffected()` (line ~84), change the queried
layers to include trails:

```ts
  const routes = map.queryRenderedFeatures(undefined, {
    layers: [ROUTE_LAYERS.open, ROUTE_LAYERS.trail],
  }) as MapGeoJSONFeature[];
```

Update the module doc comment at the top of `fire.ts` if it says "open/closed
lines" in a way that now reads wrong (it currently says routes are pushed
"into a dedicated 'affected' source drawn in warning red on top of the
open/closed lines" — still accurate; only touch it if you must).

**Verify**: `cd web && npx tsc --noEmit` → exit 0.

### Step 6: Manual QA in the dev server

`cd web && npm run dev`, open http://localhost:5173 and check:

1. Zoom into a forest (use the "Jump to a forest…" select → "San Bernardino",
   or search "Big Bear"). Click a **dashed purple** line (an open trail): a
   popup must appear with name/forest/season rows, and the cursor must become
   a pointer on hover.
2. Popup text renders literally — no raw `&amp;` double-escapes visible in
   normal names (spot-check a few popups).
3. Toggle "Wildfire perimeters" on. If California currently has no active
   fires the status line reads "No active fire perimeters in California right
   now" — that's fine; the trail-intersection path can't be exercised live.
   Note in your report whether fire data was present during QA.

**Verify**: the three checks above pass (report each).

## Test plan

No test infrastructure exists yet (plan 002 creates it — it runs after this
plan). Testing here is the typecheck plus the manual QA in Step 6. When plan
002 lands, its `escape.test.ts` covers the helper created here; no additional
work required from this plan.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd web && npx tsc --noEmit` exits 0
- [ ] `cd web && npm run build` exits 0
- [ ] `grep -n "ROUTE_LAYERS.trail" web/src/main.ts` returns at least one match
      inside the popup loop
- [ ] `grep -n "ROUTE_LAYERS.trail" web/src/fire.ts` returns a match inside
      `recomputeAffected`
- [ ] `grep -c "function esc" web/src/weather.ts web/src/export.ts` returns 0
      for both files; `web/src/escape.ts` exists and exports `esc`
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" don't match the live code (drift).
- Clicking a trail in Step 6 shows no popup after the change (would indicate
  the trail layer's filter, not the handler registration, is the problem —
  out of scope here).
- The fix seems to require touching `web/src/style.ts` or `styles.css`.
- `tsc` errors you cannot resolve within the in-scope files.

## Maintenance notes

- Any future route layer added to `ROUTE_LAYERS` must be added to **three**
  consumers: the popup loop (`main.ts`), the fire intersection (`fire.ts`),
  and the export collector (`export.ts`) — plus the weather-mode hit test
  (`weather.ts`). A reviewer should ask this question on any PR touching
  `style.ts`. (A follow-up refactor could export a `CLICKABLE_ROUTE_LAYERS`
  array from `style.ts`; deferred to keep this diff minimal.)
- Reviewer should scrutinize: no behavior change to closed-route popups, and
  that `esc` is applied to *values*, not to the HTML skeleton.
- Deferred: the AQI status line says "Good across California" even when the
  service returns zero features (`main.ts:174`, `aqi.ts:82-85`) — see the
  backlog section of `plans/README.md`.
