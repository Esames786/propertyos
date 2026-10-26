# Design system v2: Limestone & Evergreen

**Status:** implemented in Stage 1.5 step 1 (branch `feature/stage-1.5-premium-design`). Direction A was approved on 2026-10-26, with two borrowings:
- Meridian's (B) clear tabular financial typography;
- Nocturne's (C) night palette as the basis for a future dark theme.

**Source of truth:** `packages/tokens/src/theme.css`, consumed through Tailwind v4 `@theme`.

## 1. Colour

### Surfaces and text

| Role | Token | Value | Measured contrast |
|---|---|---|---|
| Page canvas (limestone) | `bg` | `#F6F3EE` | — |
| Content surface | `panel` | `#FFFFFF` | — |
| Raised well (rail hover, table head) | `raised` | `#FBFAF7` | — |
| Sunken well (segmented track, skeleton) | `sunken` | `#EFEAE2` | — |
| Ink | `text` | `#17211E` | 14.9:1 on canvas |
| Secondary text | `muted` | `#58625D` | 5.7:1 on canvas, 6.3:1 on white |
| Hint text | `subtle` | `#5F6863` | 5.2:1 on canvas |
| Decorative hairline | `border` | `#E4DDD2` | decorative only (< 3:1 by design) |
| Control boundary | `border-control` | `#878C84` | 3.4:1 on white, 3.1:1 on canvas |

### Accent colours

| Role | Token | Value | Measured contrast |
|---|---|---|---|
| Evergreen (the single action colour) | `primary` | `#1E4D42` | 8.6:1 on canvas; white on it 9.6:1 |
| Bronze (eyebrows, accent text) | `accent` | `#7A5221` | 6.9:1 on white |
| Brass | `brass` | `#B58A47` | decoration only (monogram hairline, dots); the test asserts it is never used for text |

### Status and training colours

Each is paired with an icon and a word, never colour alone:

| State | Text / soft background | Contrast |
|---|---|---|
| success | `#256B3E` / `#E8F2EA` | 5.6:1 |
| warning | `#8A5300` / `#F6EAD7` | 5.3:1 |
| error | `#A33A2A` / `#FBEAE6` | 5.6:1 |
| info | `#3D5A80` / `#E8EEF6` | 6.1:1 |
| demo / training | `#6B4A8F` / `#F1EBF8` | 6.0:1 |

### More-contrast mode

`data-contrast="more"` or the OS setting darkens:
- `muted` and `subtle` to `#3E4A45` (8.4:1);
- hairlines to `#878C84`;
- control boundaries to `#5E6560`;
- chart gridlines.

### Night palette (authored, not exposed)

Derived from Direction C under `:root[data-theme='night']`:
- obsidian `#0C0E11`;
- ivory text `#F1ECE2` (15.1:1 on panel);
- teal action `#63B7AA` (7.5:1);
- champagne accent `#D6B884` (9.4:1);
- control boundary `#6E737B` (3.7:1).

Every contrast pair also runs against this palette in `contrast.test.ts`, so the dark theme can ship later without redoing the measurements.

### Text on photography

Text never sits directly on a photo.
- **Text blocks:** carry their own scrim (`imageScrimGradient()`), which is never lighter than `rgb(12 17 15 / 0.62)` behind text and fades to clear 3.5 rem above.
- **Chips:** use `/ 0.66`.
- **The test:** composites both over a pure-white pixel (the worst case for any photo) and requires 4.5:1 for white text.

## 2. Data visualisation

The colours are validated with the data-viz palette checks (`validate_palette.js`):
- lightness band;
- chroma floor;
- colour-vision-deficiency separation (ΔE, OKLab ×100);
- the normal-vision floor;
- contrast against the chart surface.

### Categorical palette (series identity, fixed order, never cycled)

| Slot | Hue | Light | Dark |
|---|---|---|---|
| 1 | evergreen | `#0F8466` | `#2FA483` |
| 2 | brass | `#C2862A` | `#B8863A` |
| 3 | slate | `#4061B8` | `#6F8FDB` |
| 4 | clay | `#C25B3C` | `#D9744F` |
| 5 | plum | `#7E5AA6` | `#A07CC6` |

**Validation results**

| Mode | Lightness band | Chroma | Worst adjacent CVD ΔE | Worst normal-vision ΔE | Contrast |
|---|---|---|---|---|---|
| Light | pass | pass (≥ 0.10) | 10.3 (protan) | 19.7 | all ≥ 3:1 |
| Dark | pass | pass | 9.9 (protan) | 16.5 | all ≥ 3:1 |

### Ordinal ramps (ordered categories, one hue, light to dark)

| Ramp | Steps | Used for | Light end |
|---|---|---|---|
| Evergreen | `#86BCA9` `#4F9C84` `#1F6E59` `#0F4536` | Unit lifecycle (available → on hold → sold → handed over); darker means further along | 2.15:1 |
| Bronze | `#D4AC70` `#C0904A` `#A3742F` `#7F5823` `#5A3C18` | Sales funnel stages | 2.11:1 |

Both ramps pass the validator's ordinal checks: monotone lightness, adjacent ΔL ≥ 0.06, and a light end above 2:1.

### Chart rules applied

**Marks and labels**
- Columns ≤ 24 px with a 4 px rounded data end and a square baseline.
- Stacked segments are separated by a 2 px surface gap.
- Gridlines are solid hairlines.
- Labels are selective: the latest period, plus inside-segment counts only when they fit.
- Text always uses text tokens, never the series colour.

**Interaction and accessibility**
- Every chart has a data-table twin behind a "Data table" toggle and a plain-language summary that serves as its accessible description.
- Tooltips appear on hover and on keyboard focus, and never gate a value.

**Layout and motion**
- The time axis mirrors in Urdu.
- The period control sits in one row above everything it scopes.
- A refetch keeps the previous frame at reduced opacity, with no skeleton flash.

**Typography decision**

Dashboard figures use Geist sans with proportional figures; tables and axes use tabular figures. This is B's financial-typography borrowing, and it matches the data-viz rule that a hero number uses the interface sans. Newsreader (serif) carries the editorial voice instead: greetings, section titles, project and residence names.

## 3. Type

| Role | Latin | Urdu | Notes |
|---|---|---|---|
| Display (h1/h2/h3, project names) | Newsreader Variable (optical sizes) | Gulzar (Nastaliq-style) | Stack `'Newsreader Variable', 'Gulzar', …`: Latin names inside Urdu stay in Newsreader |
| Interface | Geist Variable | Noto Naskh Arabic Variable | Stack `'Geist Variable', 'Noto Naskh Arabic Variable', …` |
| References | Geist Mono Variable (`.ref-mono`) | — | Always `dir=ltr` and isolated |

All fonts are self-hosted from Fontsource (OFL), with no font CDN. Urdu files download only when Urdu text is on screen. Urdu line-heights are raised for Nastaliq (`:root:lang(ur)`).

## 4. Shape, elevation, motion

**Shape**
- Radii: `sm` 6, `control` 10, `tile` 14, `card` 20, `pill`.
- Cards sit on white with soft, warm layered shadows (`shadow-card`, `shadow-raised`, `shadow-overlay`); hairlines replace boxes.

**Motion**
- Durations: `fast` 140 ms, `regular` 220 ms, `slow` 360 ms.
- Easings: `standard` cubic-bezier(.2,0,0,1); `emphasized` cubic-bezier(.16,1,.3,1).
- Motion (`motion` 14.6) is used for the sliding rail marker, segmented and tab pills, the bottom-bar pill, count-ups, chart draw-in and morph, the showcase crossfade and swipe, and the progress rings.
- Reduced motion (OS or in-app) zeroes CSS durations, and every Motion animation checks `useReducedMotion()`, so content renders final immediately.

## 5. Shell

**Desktop and tablet (≥ 768 px)**
- A floating white rail on the canvas holds:
  - the tenant brand: an evergreen monogram with a brass hairline, plus the name in Newsreader;
  - grouped navigation (Workspace · Operations · Insights · Prototype) with a sliding inset marker on the current item;
  - the collapse control (80 px icon rail).
- The header floats on the canvas and gains a hairline only when content scrolls under it. It holds the project pill, search pill (Ctrl K), evergreen quick-create pill, language, notifications, help and avatar.

**Phone (< 768 px)**
- An app-style top bar.
- A bottom bar with the persona's first four destinations plus "More" (opens the full menu sheet).
- Safe-area insets respected.

All guided-tour anchors are unchanged (`nav-primary`, `nav-menu-button`, `project-switcher`, `command-search`, `quick-create`, `global-help`).
