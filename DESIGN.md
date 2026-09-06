---
name: "Aurora Haze"
description: "Warm grainy aurora applied with restraint — amber bleeds into coral and softens into violet, with real fractal-noise grain layered on top. Inter throughout, generous bone-white surfaces, and the gradient appears in exactly two places: the primary CTA and the featured hero tile. Everything else stays calm so the bloom carries."
tags: [grainy, gradient, modern, premium, light]
colors:
  primary: "#171419"
  secondary: "#6b6470"
  tertiary: "#ef5a8a"
  neutral: "#fbf8f5"
  surface: "#ffffff"
typography:
  display: Inter
  body: Inter
  mono: "JetBrains Mono"
  scale:
    hero: "4.5rem / 1.02 / 700 / -0.04em"
    h1: "2.75rem / 1.1 / 700 / -0.03em"
    h2: "1.625rem / 1.22 / 600 / -0.018em"
    body: "1.0625rem / 1.6 / 400 / -0.005em"
radius:
  sm: 10px
  md: 16px
  lg: 22px
  pill: 9999px
shadows:
  card: "rgba(23,20,25,0.04) 0 1px 2px, rgba(23,20,25,0.06) 0 14px 36px -16px"
  button: "rgba(240,102,148,0.28) 0 10px 24px -10px, rgba(140,92,255,0.22) 0 6px 18px -8px"
borders:
  card: "1px solid rgba(23,20,25,0.06)"
  divider: rgba(23,20,25,0.08)
buttons:
  primary:
    background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/></svg>"), radial-gradient(ellipse 90% 70% at 12% 88%, #ff8a4c 0%, transparent 55%), radial-gradient(ellipse 70% 80% at 88% 12%, #c47bff 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 55% 50%, #ff6b9b 0%, transparent 60%), linear-gradient(135deg, #ffb27a 0%, #f06694 45%, #8c5cff 100%)
    color: #ffffff
    border: none
    shape: rounded
    padding: 12px 22px
    font: 700 / 0.9375rem
    shadow: rgba(240,102,148,0.28) 0 10px 24px -10px, rgba(140,92,255,0.22) 0 6px 18px -8px
  secondary:
    background: #171419
    color: #fbf8f5
    border: none
    shape: rounded
    padding: 12px 22px
    font: 600 / 0.9375rem
  outline:
    background: transparent
    color: #171419
    border: 1px solid rgba(23,20,25,0.16)
    shape: rounded
    padding: 12px 22px
    font: 600 / 0.9375rem
  ghost:
    background: transparent
    color: #6b6470
    border: none
    shape: rounded
    padding: 12px 18px
    font: 600 / 0.9375rem
charts:
  variant: "rounded-bars"
  stroke_width: 1.5
  fill_opacity: 0.12
  gridlines: false
  bar_gap: 10px
  dot_marker: true
  palette:
    [
      rgba(23,
      20,
      25,
      0.10),
      rgba(23,
      20,
      25,
      0.10),
      rgba(23,
      20,
      25,
      0.10),
      "#f06694",
      rgba(23,
      20,
      25,
      0.10),
      rgba(23,
      20,
      25,
      0.10),
      rgba(23,
      20,
      25,
      0.10),
    ]
fonts_url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
dependencies: ["lucide-react"]
---

# Aurora Haze

## AI Build Instructions

> **Read this section before writing any code.** The rules below
> are non-negotiable. Every value used in the UI must come from this
> file's frontmatter — never substitute, approximate, or invent new
> colors, fonts, radii, or shadows. If a value is missing, ask the
> user before adding one.

### 1 · Your role

You are building UI for a project that has adopted **Aurora Haze** as its
design system. Treat `DESIGN.md` as the single source of truth.
Your job is to translate the user's product requirements into
components and pages that look like they were designed by the same
person who authored this file.

### 2 · Token compliance

- Pull every color, font family, radius, shadow, and spacing value
  from the frontmatter at the top of this file.
- Use semantic roles (e.g. `primary`, `accent`, `muted`) — never
  hard-code hex values that bypass the system.
- When a token can be expressed as a CSS variable, declare it once
  in your global stylesheet and reference it everywhere downstream.
- The Google Fonts `<link>` is provided in the Typography section.
  Add it to `<head>` before any component renders.

### 3 · Component recipes

Use these recipes verbatim when building the corresponding component.

#### Buttons

Four variants are defined. Pick one — never blend variants or invent a fifth.

- **Primary** — rounded shape, bg `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/></svg>"), radial-gradient(ellipse 90% 70% at 12% 88%, #ff8a4c 0%, transparent 55%), radial-gradient(ellipse 70% 80% at 88% 12%, #c47bff 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 55% 50%, #ff6b9b 0%, transparent 60%), linear-gradient(135deg, #ffb27a 0%, #f06694 45%, #8c5cff 100%)`, text `#ffffff`, padding `12px 22px`, weight `700`, shadow `rgba(240,102,148,0.28) 0 10px 24px -10px, rgba(140,92,255,0.22) 0 6px 18px -8px`.
- **Secondary** — rounded shape, bg `#171419`, text `#fbf8f5`, padding `12px 22px`, weight `600`.
- **Outline** — rounded shape, text `#171419`, border `1px solid rgba(23,20,25,0.16)`, padding `12px 22px`, weight `600`.
- **Ghost** — rounded shape, text `#6b6470`, padding `12px 18px`, weight `600`.

Reach for **primary** as the single dominant CTA per screen.
**Secondary** for the supporting action. **Outline** for tertiary
actions in toolbars. **Ghost** for inline links and table actions.

#### Cards

- Background: `#ffffff`
- Border: `1px solid rgba(23,20,25,0.06)`
- Shadow: `rgba(23,20,25,0.04) 0 1px 2px, rgba(23,20,25,0.06) 0 14px 36px -16px`
- Radius: `radius.lg` (`22px`)
- Internal padding: `20px` for compact cards, `24–28px` for content cards.

#### Tabs

Variant: `underline`. Flat row of labels. Active tab gets a 2px underline in the accent color — no fill.

#### Charts

- Bar/line variant: `rounded-bars`
- No gridlines — let the bars/lines carry the data.
- Use the declared palette in order: `rgba(23,20,25,0.10)`, `rgba(23,20,25,0.10)`, `rgba(23,20,25,0.10)`, `#f06694`, `rgba(23,20,25,0.10)`, `rgba(23,20,25,0.10)`, `rgba(23,20,25,0.10)`.

#### Typography pairings

- **Display (`Inter`)** — h1, h2, hero headlines, brand wordmarks.
- **Body (`Inter`)** — paragraphs, labels, button text, form inputs.
- **Mono (`JetBrains Mono`)** — code, eyebrows, metadata, numerals in tables.

### 4 · Hard constraints

Never do any of the following without explicit instruction from the user:

- Introduce a new color, font, radius, or shadow that isn't declared above.
- Mix this system with another (e.g. don't paste in Material or Bootstrap defaults).
- Use generic gradient defaults (purple→blue, peach→pink) — they break the system's voice.
- Reach for emoji icons. Use a consistent icon library and size icons in line with body type.
- Add motion that exceeds the system's restraint — keep transitions short (≤200ms) and subtle.

### 5 · Before you finish — verify

Run through this checklist for every screen you produce:

- [ ] Every color used appears in the Colors table above.
- [ ] Headlines use the display font; body copy uses the body font.
- [ ] Buttons match one of the declared variants exactly (shape, padding, weight).
- [ ] Border-radius values come from `radius.sm` / `radius.md` / `radius.lg` / `radius.pill`.
- [ ] Cards and dividers use the declared border + shadow tokens.
- [ ] No values were invented; if you needed something missing, you stopped and asked.

---

## 1. Atmosphere

Aurora Haze is a calm bone-white surface with one hot moment: a multi-stop grainy aurora gradient that runs amber → coral → soft violet, with real SVG fractal-noise grain layered on top. The gradient lives in exactly two places — the primary CTA and the featured hero tile — so it always reads as a deliberate bloom, never decoration. Inter carries every word at 400/600/700; numbers shift to JetBrains Mono. Surfaces are flat ivory, hairlines at 6% ink, generous white space.

The discipline is in placement: the gradient is never repeated on a third surface. Buttons that aren't the CTA fall back to graphite, outline, or ghost. The chart uses muted graphite bars except for one column rendered in coral — the visual rhyme tells you "this is the active value" without copy.

**Signature moves**

- Multi-stop grainy gradient (amber → coral → violet) with **real fractal-noise grain** baked in via an inline SVG `feTurbulence` data URI
- Gradient appears exactly twice per screen: primary CTA + featured hero tile
- The **active bar** in the chart picks up the coral stop from the gradient — visual rhyme
- Bone-white surface (`#fbf8f5`), hairlines at 6% ink, no decorative borders
- Inter at every level — display 700, body 400, UI 600

## 2. The grainy gradient (copy this exactly)

The grain is not a Photoshop filter or a Tailwind class — it is an inline SVG with `feTurbulence` set to `fractalNoise`, baseFrequency `0.9`, two octaves, stitched. The noise layer sits **on top** of a stack of three radial-gradient blooms over a 135° linear base. Stop order matters.

```css
background:
  url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.55'/></svg>"),
  radial-gradient(ellipse 90% 70% at 12% 88%, #ff8a4c 0%, transparent 55%),
  radial-gradient(ellipse 70% 80% at 88% 12%, #c47bff 0%, transparent 55%),
  radial-gradient(ellipse 50% 60% at 55% 50%, #ff6b9b 0%, transparent 60%),
  linear-gradient(135deg, #ffb27a 0%, #f06694 45%, #8c5cff 100%);
```

The `feColorMatrix` reduces the noise to alpha-only (no color shift), so the grain darkens the gradient instead of tinting it. The 0.55 opacity is the calibrated value — anything higher reads as "dirty," anything lower disappears on retina screens.

### Stop palette

- **Amber bloom** `#ff8a4c` — bottom-left anchor
- **Violet bloom** `#c47bff` — top-right counter-anchor
- **Coral core** `#ff6b9b` — center bloom, 60% reach
- **Linear base** `#ffb27a → #f06694 → #8c5cff` at 135°

## 3. Palette

### Surface

- **Bone** `#fbf8f5` — page background
- **Snow** `#ffffff` — cards, sheets

### Ink

- **Ink** `#171419` — text, headings, secondary CTA fill
- **Ink 55** `#6b6470` — secondary text, mono labels
- **Hairline** `rgba(23,20,25,0.06)` — every divider

### Accent (single)

- **Coral** `#ef5a8a` — picked from the gradient's mid stop, used for active tab underline + active chart bar

## 4. Typography

| Role        | Font           | Size | Weight | Leading | Tracking |
| ----------- | -------------- | ---- | ------ | ------- | -------- |
| Hero        | Inter          | 72px | 700    | 1.02    | -0.04em  |
| H1          | Inter          | 44px | 700    | 1.10    | -0.03em  |
| H2          | Inter          | 26px | 600    | 1.22    | -0.018em |
| Body        | Inter          | 17px | 400    | 1.6     | -0.005em |
| UI / Button | Inter          | 15px | 700    | 1.4     | 0        |
| Number      | JetBrains Mono | 13px | 500    | 1.0     | 0        |

Inter at three weights only — 400, 600, 700. The 800 weight is reserved for the optional oversized gradient KPI inside the featured tile.

## 5. Buttons

### Primary (Grainy Gradient Box)

A solid box (not a pill) with the full grainy-gradient stack as background, white label, no border. The drop shadow uses two layered colored shadows that pick the coral and violet stops — they bloom under the button like a soft halo.

```css
background: /* the full grainy gradient stack from §2 */;
color: #ffffff;
padding: 12px 22px;
border-radius: 16px;
box-shadow:
  rgba(240, 102, 148, 0.28) 0 10px 24px -10px,
  rgba(140, 92, 255, 0.22) 0 6px 18px -8px;
font: 700 15px/1.4 Inter;
```

### Secondary (Graphite Box)

Solid ink `#171419`, bone label, same 16px radius, no shadow. The graphite-on-bone pairs cleanly with the gradient without competing.

### Outline & Ghost

- Outline: transparent, 1px hairline at 16% ink
- Ghost: no border, ink-55, hover lifts to ink

## 6. The Featured tile

The featured hero tile uses the **same exact gradient stack** as the primary CTA. White display headline at 32px in Inter 700, label "Featured" in mono at 11px uppercase 0.12em tracking. No badge, no icon — the gradient does the work.

## 7. Charts

Rounded bars (pill ends), 10px gap. Six bars in graphite at 10% opacity, **one bar in coral** `#f06694` (the gradient's mid stop). The eye reads the coral bar as the active value because it visually rhymes with the CTA — no separate legend needed.

## 8. Tabs

Underline 1.5px in coral. Inactive tabs in Inter 600 ink-55. Hover lifts to ink. Active = ink + coral underline.

## 9. Spacing

- Base 4px
- Scale: `4, 8, 12, 16, 20, 24, 32, 48, 64, 96`
- Section padding: 96px desktop, 48px mobile

## 10. Do's & don'ts

✅ **Do**

- Use the full grainy-gradient stack from §2 verbatim — the noise layer is what makes it expensive
- Apply the gradient exactly twice per screen: primary CTA + featured tile
- Pick the active chart bar from the gradient's coral stop so it rhymes with the CTA
- Layer two colored shadows under the gradient button — coral + violet, low opacity, wide spread

❌ **Don't**

- Apply the gradient to a third surface (cards, secondary buttons, headers) — it loses its weight
- Use a 2-stop gradient (e.g. peach → pink) — this system is multi-stop with grain, never the cliché
- Skip the SVG noise layer — without grain the gradient reads as generic
- Use coral anywhere except active states (chart bar, tab underline) — the gradient owns the bloom

---

## Tokens

> Generated from the same source the live preview renders from.
> Treat the values below as the contract — never substitute approximations.

### Colors

| Role      | Value     |
| --------- | --------- |
| primary   | `#171419` |
| secondary | `#6b6470` |
| tertiary  | `#ef5a8a` |
| neutral   | `#fbf8f5` |
| surface   | `#ffffff` |

### Typography

- **Display:** Inter
- **Body:** Inter
- **Mono:** JetBrains Mono

| Role | size / leading / weight / tracking |
| ---- | ---------------------------------- |
| Hero | 4.5rem / 1.02 / 700 / -0.04em      |
| H1   | 2.75rem / 1.1 / 700 / -0.03em      |
| H2   | 1.625rem / 1.22 / 600 / -0.018em   |
| Body | 1.0625rem / 1.6 / 400 / -0.005em   |

### Radius

- sm: `10px`
- md: `16px`
- lg: `22px`
- pill: `9999px`

### Shadows

- **card:** `rgba(23,20,25,0.04) 0 1px 2px, rgba(23,20,25,0.06) 0 14px 36px -16px`
- **button:** `rgba(240,102,148,0.28) 0 10px 24px -10px, rgba(140,92,255,0.22) 0 6px 18px -8px`

### Borders

- **card:** `1px solid rgba(23,20,25,0.06)`
- **divider:** `rgba(23,20,25,0.08)`

### Buttons

Four variants, each fully tokenized. The preview renders from these exact values.

#### Primary

| Property   | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| shape      | `rounded`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| background | `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/></svg>"), radial-gradient(ellipse 90% 70% at 12% 88%, #ff8a4c 0%, transparent 55%), radial-gradient(ellipse 70% 80% at 88% 12%, #c47bff 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 55% 50%, #ff6b9b 0%, transparent 60%), linear-gradient(135deg, #ffb27a 0%, #f06694 45%, #8c5cff 100%)` |
| color      | `#ffffff`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| border     | `none`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| padding    | `12px 22px`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| fontWeight | `700`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| fontSize   | `0.9375rem`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| shadow     | `rgba(240,102,148,0.28) 0 10px 24px -10px, rgba(140,92,255,0.22) 0 6px 18px -8px`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

#### Secondary

| Property   | Value       |
| ---------- | ----------- |
| shape      | `rounded`   |
| background | `#171419`   |
| color      | `#fbf8f5`   |
| border     | `none`      |
| padding    | `12px 22px` |
| fontWeight | `600`       |
| fontSize   | `0.9375rem` |

#### Outline

| Property   | Value                           |
| ---------- | ------------------------------- |
| shape      | `rounded`                       |
| background | `transparent`                   |
| color      | `#171419`                       |
| border     | `1px solid rgba(23,20,25,0.16)` |
| padding    | `12px 22px`                     |
| fontWeight | `600`                           |
| fontSize   | `0.9375rem`                     |

#### Ghost

| Property   | Value         |
| ---------- | ------------- |
| shape      | `rounded`     |
| background | `transparent` |
| color      | `#6b6470`     |
| border     | `none`        |
| padding    | `12px 18px`   |
| fontWeight | `600`         |
| fontSize   | `0.9375rem`   |

### Charts

| Property    | Value                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| variant     | `rounded-bars`                                                                                                                                      |
| strokeWidth | `1.5`                                                                                                                                               |
| fillOpacity | `0.12`                                                                                                                                              |
| gridlines   | `false`                                                                                                                                             |
| barGap      | `10px`                                                                                                                                              |
| dotMarker   | `true`                                                                                                                                              |
| palette     | `rgba(23,20,25,0.10)`, `rgba(23,20,25,0.10)`, `rgba(23,20,25,0.10)`, `#f06694`, `rgba(23,20,25,0.10)`, `rgba(23,20,25,0.10)`, `rgba(23,20,25,0.10)` |

---

## Pro tokens

> Production-fidelity tokens. States, density, motion, elevation,
> content rules and a measured WCAG contract — derived from the
> resting tokens unless explicitly authored.

### States

#### Button

- **hover** — shadow: `0 4px 12px -2px rgba(15,23,42,0.18)`, filter: `brightness(0.97)`
- **focus** — outline: `2px solid rgba(239, 90, 138, 0.5)`, outline-offset: `2px`
- **active** — shadow: `0 1px 2px rgba(15,23,42,0.1)`, transform: `scale(0.98)`
- **disabled** — opacity: `0.4`, filter: `saturate(0.5)`
- **loading** — opacity: `0.7`
- **selected** — bg: `#ef5a8a`, color: `#ffffff`

#### Input

- **hover** — border: `1px solid rgba(239, 90, 138, 0.5)`
- **focus** — border: `1.5px solid #ef5a8a`, shadow: `0 0 0 4px rgba(239, 90, 138, 0.15)`
- **disabled** — bg: `rgba(23, 20, 25, 0.04)`, opacity: `0.4`
- **error** — border: `1.5px solid #DC2626`, shadow: `0 0 0 4px rgba(220,38,38,0.15)`

#### Card

- **hover** — shadow: `0 12px 28px -12px rgba(15,23,42,0.18)`, transform: `translateY(-2px)`
- **selected** — bg: `rgba(239, 90, 138, 0.04)`, border: `1.5px solid #ef5a8a`
- **dragging** — shadow: `0 20px 48px -16px rgba(15,23,42,0.3)`, transform: `scale(1.02) rotate(-0.5deg)`, opacity: `0.9`

#### Tab

- **hover** — bg: `rgba(239, 90, 138, 0.06)`, color: `#ef5a8a`
- **focus** — outline: `2px solid rgba(239, 90, 138, 0.5)`, outline-offset: `2px`
- **selected** — color: `#ef5a8a`, border: `0 0 2px 0 solid #ef5a8a`

### Density

| Mode        | padding × | row × | body      | radius × | Use for                                      |
| ----------- | --------- | ----- | --------- | -------- | -------------------------------------------- |
| compact     | 0.72      | 0.78  | 0.8125rem | 0.85     | Information-dense — tables, IDEs, dashboards |
| comfortable | 1         | 1     | 0.9375rem | —        | Default — most product UI                    |
| spacious    | 1.35      | 1.3   | 1rem      | 1.15     | Editorial — marketing, long-form, settings   |

### Motion

**Signature — Quiet ease.** 240 ms ease-out for all standard transitions. Reliable, invisible — motion stays out of the way.

```css
transition: all 240ms cubic-bezier(0.4, 0, 0.2, 1);
```

| Token             | Value                              |
| ----------------- | ---------------------------------- |
| duration.instant  | `80ms`                             |
| duration.fast     | `160ms`                            |
| duration.base     | `240ms`                            |
| duration.slow     | `380ms`                            |
| easing.standard   | `cubic-bezier(0.4, 0, 0.2, 1)`     |
| easing.decelerate | `cubic-bezier(0.0, 0, 0.2, 1)`     |
| easing.accelerate | `cubic-bezier(0.4, 0, 1, 1)`       |
| easing.spring     | `cubic-bezier(0.34, 1.4, 0.64, 1)` |

### Elevation

Five-level scale, system-specific recipe.

| Level  | Shadow                                                                  | Recipe                            |
| ------ | ----------------------------------------------------------------------- | --------------------------------- |
| level0 | `none`                                                                  | Flat — hairline border separates. |
| level1 | `0 1px 2px rgba(15,23,42,0.06), 0 1px 3px rgba(15,23,42,0.04)`          | List rows, resting cards.         |
| level2 | `0 4px 12px -2px rgba(15,23,42,0.1), 0 2px 6px rgba(15,23,42,0.06)`     | Hover cards, popover.             |
| level3 | `0 12px 32px -8px rgba(15,23,42,0.16), 0 4px 12px rgba(15,23,42,0.08)`  | Sheets, side panels.              |
| level4 | `0 28px 64px -16px rgba(15,23,42,0.28), 0 8px 24px rgba(15,23,42,0.12)` | Modals — scrim required.          |

### Content

- **measure:** `68ch` (max line length for body prose)
- **paragraph spacing:** `1.2em`
- **list indent:** `1.5em`
- **list gap:** `0.5em`
- **link:** color `#ef5a8a`, underline `hover`
- **blockquote:** border `3px solid rgba(239, 90, 138, 0.6)`, padding `0.5em 0 0.5em 1.25em`
- **code:** background `rgba(23, 20, 25, 0.06)`, color `#171419`

### Accessibility (WCAG 2.1)

**Overall:** AA-Large

| Pair                  | Ratio   | Required | Grade    | Suggested fix |
| --------------------- | ------- | -------- | -------- | ------------- |
| Body text on surface  | 18.25:1 | AA       | AAA      | —             |
| Body text on canvas   | 17.25:1 | AA       | AAA      | —             |
| Muted text on surface | 5.7:1   | AA       | AA       | —             |
| Accent on surface     | 3.23:1  | AA-Large | AA-Large | —             |
| Accent on canvas      | 3.05:1  | AA-Large | AA-Large | —             |
