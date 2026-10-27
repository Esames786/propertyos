# Design system v3: "Limestone & Evergreen, Clarity" (Stage 1.5R)

**Why v3.** After benchmarking Nizam, the owner asked for the same clarity and ease of use, with more animation and better placement. Nizam's brand was not to be copied (`docs/design/reference/NIZAM_WALKTHROUGH.md`). v3 keeps the v2 identity (evergreen action colour, Newsreader for brand moments, Geist for the interface, bronze accents) and changes how screens are composed.

## What changed from v2

| Area | v2 (Stage 1.5) | v3 (Stage 1.5R) |
|---|---|---|
| Canvas | Warm limestone `#f6f3ee` | Near-white limestone `#f6f6f3`; white cards with a hairline border |
| Headings | Serif page and panel titles | **Bold sans** page, section and panel titles. Serif is kept for project names, the property hero and entry headlines |
| Wayfinding | One evergreen icon style | **Tile palette**: nine hues (emerald, teal, sky, violet, rose, amber, orange, slate, gold) as a soft square with an ink glyph, or solid with a white glyph for quick actions. A hue identifies a module, never a status |
| Figures | Large semibold | Large **bold**; colour only with a label (pending in red with "Pending", collected in green with "Collected") |
| Records | Tables and lists | **Record cards**: bold title, chips, Call/WhatsApp at the inline end, an optional amount strip, and a coloured inline-start edge for state (always with a text chip) |
| Phone shell | Bottom bar, plus a menu sheet behind a hamburger | **Floating rounded top bar**; floating bottom bar with a **raised centre Quick create (+)**; a full **More** page with icon cards and a demo-role switch |
| Tour | Spotlight on shell controls | Spotlight on **real dashboard and CRM widgets**, scrolled to the centre, with an illustrated header for intro steps, Skip, **Pause**, Back and Next, and a **Resume** chip after a pause |
| Motion | Count-ups and chart draw-ins | Plus staggered card entrances, a hover lift, pressed scale, sliding pills (filters, bottom bar, nav), a page settle on navigation, and pop-in for the centre action. All transform or opacity only, and **off under reduced motion** |

## Tokens added (`packages/tokens/src/theme.css`)
- `--color-on-tile`, and `--color-tile-{hue}`, `-soft` and `-ink` for the nine hues, each with night-palette soft and ink values.
- `--shadow-lift` (hover) and `--shadow-fab` (centre action); card radius 18 px.
- Keyframes `pop-in` and `shimmer`. Shimmer is stopped under reduced motion.
- Contrast is proved by `packages/tokens/src/contrast.test.ts` (199 cases):
  - white glyph on each solid tile ≥ 3:1;
  - ink on soft and ink on card ≥ 4.5:1;
  - in the standard, more-contrast and night palettes.

## Components added (`packages/ui`)

| Component | Use |
|---|---|
| `IconTile`, `HueChip` | Icon squares and neutral attribute chips (tower, block, project) |
| `MetricCard` | Icon, label, bold value and context. It is a link when it opens a list, and stacks when narrow (two-up on phones) |
| `AmountStrip` | A record's key amount in a tinted strip with an uppercase meaning label |
| `RecordCard` | A record card with a stretched title link and action buttons above it (no nested interactive elements) |
| `ContactButtons` | Call and WhatsApp with the person's name. Simulated in the prototype |
| `QuickActions` | A row of solid tiles that wraps on desktop and scrolls sideways on phones. Permission-filtered, and every tile reaches a working screen or drawer |
| `SectionHeading` | Small uppercase section label (a real heading) with an optional "View all" |
| `FilterPills` | A single-choice radio group with counts and a sliding selection |
| `Stagger`, `RevealItem`, `PageEnter` | Reduced-motion-aware entrances |
| `useApiMutation`, `useApiPrefetch`, `useQueryParams` | Writes that refresh every screen, cache warming, and multi-parameter URL updates |

## Rules carried forward
- Logical CSS only; the RTL guard script enforces it.
- Latin data is bidi-isolated.
- Status always has an icon and words.
- Targets are ≥ 44 px on coarse pointers.
- One h1 per page.
- Every chart has a data-table twin.
- Photos are labelled "Illustrative image".
- "Awaiting verification" is never shown as Paid.
