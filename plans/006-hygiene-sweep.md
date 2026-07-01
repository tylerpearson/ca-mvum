# Plan 006: Hygiene sweep — stale comments, dead code, social meta tags, AQI no-data wording, snow status line

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ea0a597..HEAD -- web/src/main.ts web/src/snow.ts web/index.html pipeline/fetch_mvum.py`
> Plans 001 and 004 legitimately touch `web/src/main.ts` (popup loop /
> escaping / date default). Compare the excerpts below against the live code;
> if the *excerpted lines themselves* differ beyond those plans' documented
> changes, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (run after 001/004 if possible to avoid `main.ts` merge
  conflicts; the changes don't overlap logically)
- **Category**: tech-debt / docs / bug (one small UX-truthfulness fix)
- **Planned at**: commit `ea0a597`, 2026-07-01

## Why this matters

Five small, verified defects that are individually too small for their own
plans but collectively erode trust in the code and the product:

1. A comment in `main.ts` still describes the **removed** in-memory PMTiles
   load (`archiveReady`) — actively misleading since the R2 migration.
2. `pipeline/fetch_mvum.py` carries a 22-line dead constant (`OUT_FIELDS`)
   that the query never uses (it sends `outFields=*`).
3. `web/index.html` ships `og:url` = `https://example.com/` even though the
   site is live at `https://ca-mvum.typearson.dev` — every social share emits
   a wrong canonical URL — and `og:image` is a flagged-but-undone follow-up.
4. The AQI status line says **"Air quality: Good across California"** when the
   AirNow service returns *zero* features. No data is not good air; for a
   safety-adjacent product, the message must not overclaim.
5. The snow overlay is the only live layer with **no status line** (fire,
   smoke, and AQI each have one); `DESIGN.md` says live overlays carry text
   legends, not just color washes.

## Current state

**1. Stale comment**, `web/src/main.ts:48-49` (inside the basemap `style`
object's `sources` block):

```ts
    // The "routes" vector source is added in map.on("load") once the in-memory
    // PMTiles archive (archiveReady) is registered with the protocol — see above.
```

Reality (same file, lines 24-32 + 252): the protocol reads tiles via HTTP
range requests; the source is added in `map.on("load")` with
`url: `pmtiles://${ROUTES_PMTILES}``; `archiveReady` no longer exists
(`grep -rn archiveReady web/src` → only this comment).

**2. Dead constant**, `pipeline/fetch_mvum.py:33-56`:

```python
# Attribute fields we keep. Includes display fields, the per-vehicle-class yes/no
# permission flags, and their seasonal `*_datesopen` companions.
OUT_FIELDS = ",".join(
    [
        # identity / display
        "name", "id", "forestname", "districtname",
        ...
    ]
)
```

The actual query (`fetch_mvum.py:67-75`) sends `"outFields": "*"` with a
comment explaining why (Roads/Trails field sets differ; a fixed list 400s).
`grep -n OUT_FIELDS pipeline/` → definition only, no uses.

**3. Social meta**, `web/index.html:14-17`:

```html
    <!-- Open Graph / social. Update og:url to the real deploy URL on launch.
         og:image intentionally omitted for now — add a hosted share image (follow-up). -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://example.com/" />
```

The production URL is `https://ca-mvum.typearson.dev` (README "Deploy"
section). A ready-made share image exists: `docs/screenshot.png`
(1440×813 px, 1.7 MB — acceptable as an OG image; platforms crop to 1.91:1).

**4. AQI wording**. `web/src/aqi.ts:62-86` — `refreshAqi` returns "the WORST
category present (max gridcode, **0 if none**)". `web/src/main.ts:167-181`:

```ts
    const worst = await refreshAqi(map);
    const cat = AQI_CATEGORIES.find((c) => c.code === worst);
    aqiStatus.textContent = worst <= 1
      ? "Air quality: Good across California right now"
      : `Air quality reaches “${cat?.label ?? "elevated"}” somewhere in California today`;
```

`worst === 0` (no polygons returned) currently claims "Good".

**5. Snow status**. `web/index.html:72-83` — fire/smoke/aqi each have
`<p id="…-status" class="status" role="status" aria-live="polite"></p>`; snow
has none. `web/src/main.ts:186` wires the toggle:
`snowToggle.addEventListener("change", () => setSnowVisible(map, snowToggle.checked));`
The `.status` CSS class exists (`web/src/styles.css:151`) — reuse it; add no CSS.

Conventions: comments explain *why*; match the existing status-line tone
(sentence case, honest hedging, source attribution in parentheses).

## Commands you will need

| Purpose   | Command                          | Expected on success |
|-----------|----------------------------------|---------------------|
| Install   | `cd web && npm install`          | exit 0              |
| Typecheck | `cd web && npx tsc --noEmit`     | exit 0              |
| Web tests | `cd web && npm test`             | all pass (if plan 002 landed) |
| Py tests  | `uv run pytest`                  | all pass (if plan 002 landed) |
| Dev server| `cd web && npm run dev`          | Vite on :5173       |

## Scope

**In scope** (the only files you should modify/create):
- `web/src/main.ts` (comment fix, AQI wording, snow status wiring)
- `web/index.html` (og:url, og:image, twitter image, snow status element)
- `web/public/social.png` (create — copy of `docs/screenshot.png`)
- `pipeline/fetch_mvum.py` (delete dead constant)

**Out of scope** (do NOT touch):
- `web/src/aqi.ts` — the 0-if-none return contract is fine; only the caller's
  wording changes.
- `web/src/snow.ts` — visibility logic is correct; the status line lives with
  the other status lines in `main.ts`.
- The `glyphs:` demo-server URL in `main.ts:41` — unused (no symbol layers),
  harmless, and removing it risks breaking future label layers silently.
- `DESIGN.md` / `PRODUCT.md` — plan 009 owns the doc amendments.
- `docs/screenshot.png` — copy it, don't move/modify it (README embeds it).

## Git workflow

`main` auto-deploys to production — **never commit to `main`; branch + PR.**

- Branch: `advisor/006-hygiene-sweep`
- Commit style: imperative sentence, e.g. "Hygiene: fix stale comments, social
  meta, AQI no-data wording; add snow status".
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix the stale PMTiles comment in `main.ts`

Replace lines 48-49 (the `archiveReady` sentence inside the `sources` block)
with a comment that matches reality, e.g.:

```ts
    // The "routes" vector source is added in map.on("load"); PMTiles fetches
    // tiles lazily over HTTP range requests — see the protocol setup above.
```

**Verify**: `grep -rn "archiveReady" web/src/` → no matches.

### Step 2: Delete the dead `OUT_FIELDS` constant

In `pipeline/fetch_mvum.py`, delete lines 33-56 (the comment block + the
`OUT_FIELDS = ",".join([...])` assignment). Nothing else changes — the query
already uses `outFields=*` with its own explanatory comment.

**Verify**: `grep -rn "OUT_FIELDS" pipeline/` → no matches;
`uv run python -c "import pipeline.fetch_mvum"` → exit 0.

### Step 3: Fix social meta and add the share image

1. Copy the image: `cp docs/screenshot.png web/public/social.png`.
2. In `web/index.html`:
   - `og:url` → `https://ca-mvum.typearson.dev/`
   - Add after `og:description`:
     `<meta property="og:image" content="https://ca-mvum.typearson.dev/social.png" />`
     and `<meta property="og:image:alt" content="Map of California National Forest motor-vehicle routes with the open network drawn in purple" />`
   - Change `twitter:card` from `summary` to `summary_large_image` and add
     `<meta name="twitter:image" content="https://ca-mvum.typearson.dev/social.png" />`
   - Update the HTML comment at lines 14-15 (both its sentences are now done;
     shrink it to e.g. `<!-- Open Graph / social. social.png is a copy of
     docs/screenshot.png (1440×813). -->`).

**Verify**: `grep -n "example.com" web/index.html` → no matches;
`grep -c "og:image" web/index.html` → ≥1; `ls -la web/public/social.png` →
exists, ~1.7 MB.

### Step 4: Honest AQI no-data message

In `web/src/main.ts` `toggleAqi` (lines ~167-181), split the `worst <= 1`
branch into three:

```ts
    aqiStatus.textContent =
      worst === 0
        ? "No AirNow air-quality data for California right now"
        : worst === 1
          ? "Air quality: Good across California right now"
          : `Air quality reaches “${cat?.label ?? "elevated"}” somewhere in California today`;
```

**Verify**: `cd web && npx tsc --noEmit` → exit 0.

### Step 5: Add the snow status line

1. In `web/index.html`, after the aqi status `<p>` (line ~83), add:
   `<p id="snow-status" class="status" role="status" aria-live="polite"></p>`
2. In `web/src/main.ts`:
   - Grab it alongside the others (line ~93):
     `const snowStatus = $("snow-status") as HTMLParagraphElement;`
   - Extend the snow toggle listener (line ~186):

```ts
snowToggle.addEventListener("change", () => {
  setSnowVisible(map, snowToggle.checked);
  snowStatus.textContent = snowToggle.checked
    ? "Showing modeled snow depth (NOHRSC) — darker = deeper; verify locally"
    : "";
});
```

**Verify**: `cd web && npx tsc --noEmit` → exit 0.

### Step 6: Manual QA

`cd web && npm run dev`, open http://localhost:5173:

1. Toggle "Snow depth (NOHRSC)": the status line appears under the overlay
   checkboxes and clears when toggled off.
2. Toggle "Air quality": status shows one of the three messages (which one
   depends on live data — report which you saw).
3. View page source: og/twitter tags present, no `example.com`.

**Verify**: all three observed; report each.

## Test plan

If plan 002 has landed, run `cd web && npm test` and `uv run pytest` — all
existing tests must stay green (this plan adds none: the changes are wording,
markup, and deletions; the AQI branch is display-only glue not worth a DOM
test harness). If 002 has not landed, `tsc --noEmit` + Step 6 QA is the gate.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "archiveReady" web/src/` → no matches
- [ ] `grep -rn "OUT_FIELDS" pipeline/` → no matches
- [ ] `grep -n "example.com" web/index.html` → no matches
- [ ] `web/public/social.png` exists; `grep -c "og:image\|twitter:image" web/index.html` ≥ 2
- [ ] `grep -n "No AirNow" web/src/main.ts` → one match
- [ ] `grep -n "snow-status" web/index.html web/src/main.ts` → matches in both
- [ ] `cd web && npx tsc --noEmit` exits 0; `cd web && npm run build` exits 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any excerpt above doesn't match the live code beyond plans 001/004's
  documented changes.
- `docs/screenshot.png` is missing or not a PNG.
- You find other stale comments/dead code and want to expand the sweep —
  don't; report them for the backlog instead.

## Maintenance notes

- `web/public/social.png` is a manual copy; when the map's look changes
  materially, re-copy a fresh screenshot (or generate a proper 1200×630 crop
  — deferred as not worth tooling now).
- The snow status is static text (the WMS raster gives us no feature counts).
  If NOHRSC point-query support is ever added, this line is where depth-at-
  center could surface.
- Reviewer should scrutinize: no logic changes beyond the AQI ternary and the
  snow listener; `aqi.ts` untouched.
