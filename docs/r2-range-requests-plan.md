# Plan: Move route tiles to Cloudflare R2 with HTTP range requests

**Status: DONE (2026-06-28).** Tiles are live in the `ca-mvum-tiles` R2 bucket at
`https://tiles.ca-mvum.typearson.dev`, served over `206` range requests with CORS;
the app reads them in production via `import.meta.env.PROD` in `web/src/config.ts`,
and `.github/workflows/deploy-tiles.yml` auto-uploads on tile changes. This doc is
kept as the record of how it was set up and how to roll back.

**One deviation from the steps below:** Cloudflare Pages would not inject the
`VITE_TILES_URL` build env var into the Vite build, so production detection uses
`import.meta.env.PROD` (set automatically by `vite build`) with the R2 URL baked
into `config.ts` instead. `VITE_TILES_URL` still works as an override if set.

The maxzoom-14 step (5) was intentionally **not** done — at maxzoom 13 the geometry
is already ~1 m precise and MapLibre overzooms it crisply, so full-res would nearly
double the file for no visible gain. Pull that lever only if a route ever looks
wrong at extreme zoom.

## Why

Today the app fetches the **whole** `routes.pmtiles` once into memory and serves
tiles from that buffer (a `FileSource`), because **Cloudflare Pages does not
serve HTTP range requests** — it answers a `Range` request with `200` + the full
file, which the PMTiles `FetchSource` rejects ("HTTP Byte Serving").

R2 *does* serve real range requests (`206 Partial Content`) and supports CORS, so
the PMTiles client can read just the bytes for the current viewport. That gives:

- **Incremental loading** — fetch only the tiles in view, not the whole archive.
  Faster first paint, less bandwidth for users who don't pan everywhere.
- **No 25 MiB per-file cap** — rebuild at `--maximum-zoom=14` for full-resolution
  geometry instead of the current 13.
- It's the Protomaps-recommended way to host PMTiles.

Cost: a second hosting surface (app on Pages, tiles on R2), a separate tile-upload
step (tiles stop riding along with `git push`), and CORS config.

## Prerequisites

- R2 enabled on the Cloudflare account (dashboard → R2 → enable; may require
  adding a payment method even within the free tier).
- A wrangler token **with R2 scope**. The current OAuth token (from
  `~/Library/Preferences/.wrangler/config/default.toml`) lacks R2 — re-run
  `npx wrangler login` and grant R2, or create an API token with
  *Workers R2 Storage: Edit*.

## Steps

### 1. Create the bucket and upload tiles

```bash
npx wrangler r2 bucket create ca-mvum-tiles
npx wrangler r2 object put ca-mvum-tiles/routes.pmtiles \
  --file web/public/tiles/routes.pmtiles \
  --content-type application/octet-stream
```

### 2. Expose the bucket over HTTPS with a stable URL

Pick one:

- **Custom domain (recommended):** R2 dashboard → bucket → Settings → *Custom
  Domains* → add e.g. `tiles.ca-mvum.typearson.dev`. Cloudflare provisions the
  cert and DNS. Stable URL, CDN-cached, supports range + CORS out of the box.
- **r2.dev public URL:** enable *Public access* on the bucket for a
  `https://pub-<hash>.r2.dev/...` URL. Fine for a quick test; rate-limited and
  not meant for production traffic. Prefer the custom domain for the real thing.

### 3. CORS on the bucket

R2 dashboard → bucket → Settings → CORS policy. Allow GET + the `Range` header
from the app origin:

```json
[
  {
    "AllowedOrigins": ["https://ca-mvum.typearson.dev"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["range", "if-match"],
    "ExposeHeaders": ["content-length", "content-range", "etag", "accept-ranges"],
    "MaxAgeSeconds": 3600
  }
]
```

(Add `http://localhost:5173` to `AllowedOrigins` while testing the dev server.)

### 4. Point the app at the R2 URL and drop the in-memory load

This **reverts** the Cloudflare-Pages workaround back to the standard
range-request path.

- **`web/src/config.ts`** — change `ROUTES_PMTILES` from the local
  `/tiles/routes.pmtiles` to the full R2 URL,
  e.g. `https://tiles.ca-mvum.typearson.dev/routes.pmtiles`.

- **`web/src/main.ts`** — replace the `FileSource` block (lines ~28–38) with the
  default URL-based source. Remove the `PMTiles` / `FileSource` imports (keep
  `Protocol`):

  ```ts
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  // No archiveReady — PMTiles reads tiles directly via range requests.
  ```

  Then change the source URL (line ~263) to the archive URL and delete the
  `await archiveReady` (line ~258) in `map.on("load")`:

  ```ts
  map.addSource("routes", {
    type: "vector",
    url: `pmtiles://${ROUTES_PMTILES}`,
  });
  ```

  (PMTiles' default `FetchSource` keys the protocol by the archive URL, so no
  manual `protocol.add(...)` is needed.)

### 5. (Optional) rebuild at full resolution

- **`pipeline/build_tiles.py`** — `--maximum-zoom=13` → `--maximum-zoom=14`.
  Update the comment that explains the 25 MiB / maxzoom-13 constraint (it no
  longer applies once tiles live on R2). Re-run `make tiles`, then re-upload
  (step 1's `r2 object put`).

### 6. Stop committing / shipping tiles through Pages

- Tiles no longer need to be in `web/public/tiles/` for the deployed app (R2
  serves them). Decide whether to keep the file in git for local `make dev`
  (convenient) or gitignore it. If kept for dev, `ROUTES_PMTILES` must still
  resolve locally — consider an env-switch (`import.meta.env.DEV ?
  "/tiles/routes.pmtiles" : "<R2 url>"`).
- The `_headers` `/tiles/*` cache rule and the stale "range requests work on
  Pages" comment become irrelevant — remove or update.
- Add a `make` target or note for the tile-upload step so a data refresh is
  `make tiles && wrangler r2 object put ...`, not just `git push`.

## Verification

1. **Range works:** `curl -sI -H 'Range: bytes=0-99' <R2 tiles url>` returns
   `206 Partial Content` + `Content-Range` (not `200`).
2. **CORS works:** load the deployed app, DevTools → Network → filter
   `routes.pmtiles` → confirm multiple `206` responses (one per byte range) with
   no CORS errors, instead of one big `200`.
3. **Map renders:** routes draw, popups/filters/export/weather all still work.
4. **Incremental:** panning to a new area fires new range requests rather than
   re-downloading the whole archive.

## Rollback

Keep this trivial: revert the `config.ts` + `main.ts` changes (restore the
`FileSource` block) and the app is back on Pages-only in-memory loading. The R2
bucket can stay; nothing else depends on it.
