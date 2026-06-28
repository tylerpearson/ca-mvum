# Product

## Register

product

## Users

California off-highway and backcountry drivers and riders — OHV (ATV, UTV, dirt
bike), 4WD/overland, and dual-sport — planning a trip onto National Forest
roads and trails. They arrive on phone or desktop, often the night before or at
the trailhead, to answer two questions fast:

1. **Is this route legally open to *my* vehicle on *this* date?** (MVUM
   designation + seasonal window by vehicle class.)
2. **Is it actually reachable right now?** (Active wildfire perimeters, smoke,
   and snow depth over the route.)

They are not GIS experts. They need a confident yes/no they can trust before
loading up, across all 17 California national forests.

## Product Purpose

A statewide California MVUM map that turns the Forest Service's static,
forest-by-forest motor-vehicle-use PDFs into one live, filterable map: pick a
vehicle class and date, see what's open, and overlay current fire/smoke/snow to
judge reachability. Success = a rider scans the map, filters to their rig and
day, and leaves knowing what's legal and what's risky — without cross-checking a
dozen PDFs and fire feeds.

## Brand Personality

Classic cartographic — heritage, considered, trustworthy. The voice of an
authoritative map: a 7.5-minute USGS quad's quiet confidence, not a startup's
enthusiasm. The **map is the hero**; the interface is the map's margin —
restrained chrome that frames terrain and routes. Three words: cartographic,
honest, durable. Legal and safety information is treated as first-class map
data, never buried or decorated.

## Anti-references

- **Generic SaaS template** — cream/white backgrounds, soft drop shadows,
  identical icon-cards, gradient accents. The default AI-startup look.
- **Government / forest-service page** — dense, bureaucratic, table-heavy
  officialese with no spatial sense.
- **Neon motocross / energy-drink** — aggressive neon gradients, racing
  stripes, hyper-sporty gamer styling.
- **Consumer outdoor store (REI)** — stock hero photography, e-commerce gloss,
  lifestyle marketing, buy buttons.

## Design Principles

- **The map is the hero.** Terrain and routes carry the design; chrome is the
  margin around a printed map, not a competing surface.
- **Legal clarity is the headline.** A route's open/closed/not-allowed status
  for the selected vehicle and date is always unambiguous and never relies on
  color alone.
- **Honest about data.** MVUM is legal *designation*, not a temporary closure
  order; fire/smoke/snow are situational awareness, not authority. The
  "verify before you go" disclaimer is permanent, not a dismissible toast.
- **Cartographic heritage, used not pastiched.** Quad-map typographic and color
  cues earn their place by aiding legibility; they are not decoration.
- **Legible in the field.** Readable in bright sun and in the dark — both
  themes hit contrast targets; the map stays scannable at a glance.

## Accessibility & Inclusion

Target WCAG 2.1 AA in both light and dark themes. Body text ≥4.5:1, large/UI
text ≥3:1 against panel surfaces. Route status (open / closed / not-allowed /
in-fire) must never rely on color alone — pair color with line pattern, label,
and legend so it survives color-blindness and a sun-washed screen. Honor
`prefers-reduced-motion` (map already animates on pan/zoom; UI transitions get a
non-motion fallback). Live overlays carry text legends, not just color washes.
Default theme follows `prefers-color-scheme`.
