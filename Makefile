.PHONY: help fetch normalize tiles data web-install dev build clean test

help:
	@echo "ca-mvum build pipeline"
	@echo "  make fetch        Pull MVUM roads+trails for all 17 CA forests -> data/*.geojson"
	@echo "  make normalize    Collapse to compact tile schema -> data/ca-normalized.geojson"
	@echo "  make tiles        tippecanoe -> web/public/tiles/routes.pmtiles  (needs tippecanoe)"
	@echo "  make data         fetch + normalize + tiles"
	@echo "  make web-install  npm install in web/"
	@echo "  make dev          run the Vite dev server"
	@echo "  make build        production static build -> web/dist"
	@echo "  make test         run Python (pytest) and web (vitest) test suites"

fetch:
	uv run python -m pipeline.fetch_mvum

normalize:
	uv run python -m pipeline.normalize

tiles:
	uv run python -m pipeline.build_tiles

data: fetch normalize tiles

web-install:
	cd web && npm install

dev:
	cd web && npm run dev

build:
	cd web && npm run build

clean:
	rm -f data/*.geojson

test:
	uv run pytest
	cd web && npm test
