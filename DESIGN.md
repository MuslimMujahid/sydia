---
description: >-
  A personal AI assistant site opens on an almost-black hero band, then drops to a warm white body — the two halves divided by a single saturated teal-cyan pill CTA that doubles as the brand voltage. Display headlines run Figtree at weight 800 (the heaviest 64px moment in the whole category), body copy switches to Instrument Sans, and a third voice — Martian Mono uppercase — carries every eyebrow label and feature tag. Cards on the cream body sit in #e4f0fb (a faintly blue-tinted hairline color that doubles as soft surface), the teal #32e6e2 returns as the in-card border tone, and every dark editorial panel below the fold borrows the same near-black band the hero introduces. Three typefaces, two surface eras, and one cyan pill that runs from hero to footer.

colors:
  primary: "#32e6e2"
  primary-hover: "#8efbf7"
  primary-deep: "#05bdba"
  secondary: "#0c2a2a"
  secondary-deep: "#014847"
  link: "#2e51ed"
  ink: "#181a1c"
  ink-soft: "#353a3e"
  ink-muted: "#545a61"
  ink-weak: "#778089"
  canvas: "#ffffff"
  canvas-dark: "#181a1c"
  surface-1: "#e4f0fb"
  surface-2: "#d0fffe"
  hairline: "#d1d5da"
  syntax-cyan: "#89ddff"
  syntax-purple: "#c792ea"
  warn: "#f98e21"

typography:
  display-xl:
    fontFamily: "Figtree, system-ui, Helvetica, sans-serif"
    fontSize: 64px
    fontWeight: 800
    lineHeight: 70.4px
    letterSpacing: 0
  display-md:
    fontFamily: "Figtree, system-ui, Helvetica, sans-serif"
    fontSize: 48px
    fontWeight: 700
    lineHeight: 52.8px
    letterSpacing: 0
  heading-lg:
    fontFamily: "Figtree, system-ui, Helvetica, sans-serif"
    fontSize: 36.8px
    fontWeight: 800
    lineHeight: 40.48px
    letterSpacing: 0
  heading-md:
    fontFamily: "Figtree, system-ui, Helvetica, sans-serif"
    fontSize: 32px
    fontWeight: 700
    lineHeight: 35.2px
    letterSpacing: 0
  heading-sm:
    fontFamily: "Figtree, system-ui, Helvetica, sans-serif"
    fontSize: 24px
    fontWeight: 700
    lineHeight: 26.4px
    letterSpacing: 0
  body-lg:
    fontFamily: '"Instrument Sans", system-ui, Helvetica, sans-serif'
    fontSize: 18px
    fontWeight: 400
    lineHeight: 27px
    letterSpacing: 0
  body-md:
    fontFamily: '"Instrument Sans", system-ui, Helvetica, sans-serif'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: 0
  body-sm:
    fontFamily: '"Instrument Sans", system-ui, Helvetica, sans-serif'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 21px
    letterSpacing: 0
  button-md:
    fontFamily: "Figtree, system-ui, Helvetica, sans-serif"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 19.8px
    letterSpacing: 0
  nav-link:
    fontFamily: '"Instrument Sans", system-ui, Helvetica, sans-serif'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: 0
  eyebrow-mono:
    fontFamily: '"Martian Mono", ui-monospace, "Cascadia Code", monospace'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: 0
  code-mono:
    fontFamily: '"Martian Mono", ui-monospace, "Cascadia Code", monospace'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 18px
    letterSpacing: 0

rounded:
  none: "0px"
  xs: "2px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  pill: "360px"

spacing:
  xs: "4px"
  sm: "8px"
  base: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
  4xl: "96px"

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: "10px 17px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: "10px 17px"
    height: "40px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: "10px 17px"
    height: "40px"
    borderColor: "{colors.ink}"
  button-dark-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.canvas}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: "10px 17px"
    height: "40px"
  top-nav:
    backgroundColor: "{colors.canvas-dark}"
    textColor: "{colors.canvas}"
    typography: "{typography.nav-link}"
    rounded: "{rounded.none}"
    padding: "12px 16px"
    height: "56px"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.canvas}"
    typography: "{typography.nav-link}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  hero-section:
    backgroundColor: "{colors.canvas-dark}"
    textColor: "{colors.canvas}"
    typography: "{typography.display-xl}"
    rounded: "{rounded.none}"
    padding: "96px 0px"
  hero-heading:
    backgroundColor: "transparent"
    textColor: "{colors.canvas}"
    typography: "{typography.display-xl}"
  section-heading:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.display-xl}"
  body-paragraph:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-md}"
  eyebrow-label:
    backgroundColor: "transparent"
    textColor: "{colors.link}"
    typography: "{typography.eyebrow-mono}"
  card-dark:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.canvas}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xl}"
    padding: "24px"
    borderColor: "{colors.primary}"
  card-light:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xl}"
    padding: "24px"
    borderColor: "{colors.surface-1}"
  text-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "8px"
    height: "38px"
    borderColor: "{colors.ink-weak}"
  code-block:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.canvas}"
    typography: "{typography.code-mono}"
    rounded: "{rounded.md}"
    padding: "16px"
  footer:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-sm}"
    padding: "48px 24px"
---

## Overview

The brand color is a single saturated teal-cyan (`{colors.primary}` — #32e6e2), wired into CSS as `--color-brand-2`, `--color-brand-core-2`, and `--button-primary-bg-color`. On hover it brightens to `{colors.primary-hover}` (#8efbf7), a paler teal step. A secondary brand cobalt `{colors.link}` (#2e51ed) carries the link tone and the highlighted-tab accent. The deep teal-charcoal `{colors.secondary}` (#0c2a2a) is the dark editorial surface that appears in cards below the fold — close enough to the hero's near-black that it reads as a return of the hero band, far enough that it sits as a distinct elevated surface on the white canvas.

Typography is the system's most distinctive move: **three typefaces, three jobs.** Figtree at weight 800 carries every display moment — the 64px hero h1, the 64px section h2 below the fold, and the smaller 32-48px headings inside cards. Instrument Sans handles body copy at 16-18px weight 400 and nav-link labels at 14-16px. Martian Mono at 16px in uppercase carries every eyebrow label, section tag, and feature chip — it appears 44 times in the captured page, more than any other typographic variant. The three voices divide labor cleanly: Figtree speaks, Instrument Sans explains, Martian Mono labels.

**Key Characteristics:**

- Single brand voltage `{colors.primary}` (#32e6e2) — a saturated teal-cyan that owns the primary CTA pill and the search-submit button, paired with a paler teal hover step `{colors.primary-hover}` (#8efbf7).
- Two-era page surface — near-black hero `{colors.canvas-dark}` (#181a1c) above the fold, warm white `{colors.canvas}` (#ffffff) below the fold, stitched by the cyan pill that appears in both eras.
- Three-voice typography — Figtree for display (weight 700-800), Instrument Sans for body (weight 400), Martian Mono uppercase for eyebrows (weight 400, 44 occurrences).
- Heavy 800-weight display tier — the 64px hero h1 and 64px section h2 both run at weight 800, not the 500-600 most peers use; a deliberate dial against the dark canvas.
- Deep teal-charcoal `{colors.secondary}` (#0c2a2a) — the in-body dark editorial card surface that returns the brand voltage in the white-canvas half of the page.
- Pill CTAs at `{rounded.pill}` (360px declared, rendered as fully-rounded) for both primary and secondary buttons across both surface eras.
- Hand-drawn outline illustrations in the cyan voltage color — the cloud-shopping-cart, the agent-ready primitives diagram, the speedometer-and-globe — render as line art in the teal accent on the dark canvas.
- Cobalt `{colors.link}` (#2e51ed) is the link tone and the eyebrow color, not a secondary brand voltage; it appears 0 times as background and 0 times as border in the captured page.

## Colors

### Brand

- **Teal Primary** (`{colors.primary}` — #32e6e2): frequency 0 as text and border (the brand voltage is reserved for fills) — used as background only on the primary CTA pill, the search-submit button, and the in-card border for dark editorial cards. Wired in CSS as `--color-brand-2`, `--color-brand-core-2`, `--button-primary-bg-color`, `--search-submit-btn-bg-color`, `--teal-200`. The single chromatic brand moment.
- **Teal Hover** (`{colors.primary-hover}` — #8efbf7): the paler teal hover variant for the primary CTA. Wired as `--color-brand-2-hover`, `--ntl-button-primary-bg-color-hover`, `--teal-100`, `--color-highlight`.
- **Teal Deep** (`{colors.primary-deep}` — #05bdba): the logo "spark" color, wired as `--color-brand-logo-spark` and `--teal-400`. Appears in the wordmark and in dark-on-light surfaces where the primary cyan would burn out.
- **Cobalt Link** (`{colors.link}` — #2e51ed): the link tone and the eyebrow-text color, wired as `--color-brand-primary`, `--color-brand-1`, `--color-link`, `--ntl-eyebrow-text-color`. A secondary brand voltage that carries link decoration and small accent rules.
- **Teal Secondary** (`{colors.secondary}` — #0c2a2a): the dark editorial-card surface in the white-canvas half of the page. Wired as `--button-secondary-bg-color`, `--code-bg-color`, `--teal-900`, `--active-switcher-tab-bg-color`. Frequency 3 as gradient stop — used in dark surface fills.
- **Teal Secondary Deep** (`{colors.secondary-deep}` — #014847): the wordmark text color and the secondary-button hover state. Wired as `--color-brand-logo-text`, `--color-brand-secondary-hover`, `--teal-800`.

### Surface

- **Canvas Dark** (`{colors.canvas-dark}` — #181a1c): frequency 0 as background fill, 38 as text — the near-black hero canvas above the fold and the page's primary heading color below the fold. Wired as `--ntl-neutral-800`, `--button-primary-text-color`, `--heading-text-color`. Both a surface tone and an ink tone, depending on which canvas era it sits on.
- **Canvas** (`{colors.canvas}` — #ffffff): frequency 67 — 33 as text (white type on the dark hero), 4 as background (the body floor below the fold), 30 as border. Pure white; no warm cream variant.
- **Surface 1** (`{colors.surface-1}` — #e4f0fb): frequency 85 — 37 as text, 11 as background, 37 as border. The faintly-blue hairline color that doubles as soft card-fill on the white-canvas half. Wired as `--ntl-color-bg-3`, `--ntl-neutral-200`, `--color-blog-cta-card-bg`. The single hardest-working surface token — borders cards, fills disabled states, and tints the blog-card surface.
- **Surface 2** (`{colors.surface-2}` — #d0fffe): frequency 3 as border — a very-pale cyan tint used as the search-highlight and code-on-light surface fill. Wired as `--ntl-search-user-message-color`, `--color-guide-toc-bg`, `--teal-000`.

### Text

- **Ink** (`{colors.ink}` — #181a1c): frequency 38 as text — the primary heading and button-label color below the fold. Same hex as `{colors.canvas-dark}`; the system uses one near-black for both surface and ink roles depending on context.
- **Ink Soft** (`{colors.ink-soft}` — #353a3e): the secondary running-text tone, wired as `--ntl-color-text`, `--neutral-700`. Used for body paragraphs that sit beside the heading ink without competing with it.
- **Ink Muted** (`{colors.ink-muted}` — #545a61): frequency 215 — 108 as text, 107 as border. The dominant body-paragraph color across the page and the secondary border tone. Wired as `--ntl-title-text-color`, `--ntl-neutral-600`, `--color-text-2`, `--input-color-placeholder`.
- **Ink Weak** (`{colors.ink-weak}` — #778089): the form-input border color and the testimonial-logo hover tone. Wired as `--input-border-color`, `--ntl-color-text-weak`, `--color-text-3`. The lightest readable ink in the system.

### Syntax & Accent

- **Syntax Cyan** (`{colors.syntax-cyan}` — #89ddff): frequency 48 — 24 as text, 24 as border. The code-snippet keyword color in the embedded code blocks ("Launch AI features with one gateway" panel). Borrowed from a Night Owl-style syntax theme rather than from the brand chrome.
- **Syntax Purple** (`{colors.syntax-purple}` — #c792ea): frequency 16 — 8 as text, 8 as border. The code-snippet function-name color. Also from the syntax theme.

### Hairline & Status

- **Hairline** (`{colors.hairline}` — #d1d5da): a cool grey border tone used on inverse surfaces and badges. Wired as `--ntl-color-border-strong`, `--ntl-badge-border-color`, `--card-border-color-hover`. Distinct from the soft `{colors.surface-1}` hairline which carries most of the card-border work.
- **Warn** (`{colors.warn}` — #f98e21): a saturated gold/orange wired as `--gold-400`, `--color-brand-create-2`. Carries the "Create" product-domain identity but appears 0 times in the captured render — declared in the CSS root only.

## Typography

### Font Families

The system runs three typefaces with cleanly divided jobs. **Figtree** is the display sans, used at weight 800 for the 64px hero h1 and the 64px below-fold section h2, plus weight 700 at 32-48px for smaller heading tiers. **Instrument Sans** is the body sans, used at weight 400 for paragraph copy at 14-18px and for nav-link labels at 14-16px. **Martian Mono** is the uppercase voice, used at weight 400 in all-caps for eyebrow labels above sections — 44 occurrences in the captured page, the single most-frequent type variant.

The three-voice split is the system's distinctive typographic move. Most dev-infra peers run two voices (display + body, or display + mono) — Vercel runs Geist + Geist Mono, Cloudflare runs FT Kunst Grotesk + Apercu Mono Pro, Render runs Inter + JetBrains Mono.

### Hierarchy

| Token                       | Size   | Weight | Line Height | Family          | Use                                |
| --------------------------- | ------ | ------ | ----------- | --------------- | ---------------------------------- |
| `{typography.display-xl}`   | 64px   | 800    | 70.4px      | Figtree         | Hero h1, section h2                |
| `{typography.display-md}`   | 48px   | 700    | 52.8px      | Figtree         | Pull-quote blockquotes             |
| `{typography.heading-lg}`   | 36.8px | 800    | 40.48px     | Figtree         | h3 inside dark editorial cards     |
| `{typography.heading-md}`   | 32px   | 700    | 35.2px      | Figtree         | Sub-section number callouts        |
| `{typography.heading-sm}`   | 24px   | 700    | 26.4px      | Figtree         | Card h3                            |
| `{typography.body-lg}`      | 18px   | 400    | 27px        | Instrument Sans | Hero sub-paragraph                 |
| `{typography.body-md}`      | 16px   | 400    | 24px        | Instrument Sans | Default running text               |
| `{typography.body-sm}`      | 14px   | 400    | 21px        | Instrument Sans | Nav-link labels, button labels     |
| `{typography.button-md}`    | 18px   | 600    | 19.8px      | Figtree         | CTA pill labels                    |
| `{typography.nav-link}`     | 16px   | 400    | 24px        | Instrument Sans | Top-nav link labels                |
| `{typography.eyebrow-mono}` | 16px   | 400    | 24px        | Martian Mono    | Section eyebrow labels (uppercase) |
| `{typography.code-mono}`    | 12px   | 400    | 18px        | Martian Mono    | Inline code annotations            |

### Principles

Display weight tops out at 800 — substantially heavier than the dev-infra norm (Vercel 500, Stripe 300, Cloudflare 500, Render 600). The 64px hero h1 at weight 800 reads as the loudest typographic moment in the system, and the same step repeats on the below-fold section h2 to anchor the page on a single display tier rather than a tiered ladder. The decision to dial display up to 800 instead of leaning on letter-spacing tightening (the Stripe / Cloudflare move) is what gives the hero its chunky-confident feel.

Martian Mono carries the entire eyebrow-label tier. There are no uppercase-tracked sans labels in the system — every "WAY IT WORKS", "USE CASES", "PLATFORM" small-caps section tag is set in Martian Mono. The mono voice reads quietly technical without ever shouting; the same role Apercu Mono Pro plays on Cloudflare's surface.

### Note on Font Substitutes

All three families are open source. Figtree ships on Google Fonts and Bunny Fonts. Instrument Sans is distributed free by Instrument design studio. Martian Mono is open-sourced by Evil Martians on GitHub. No substitution needed — the system already runs free fonts. If you must substitute, **Inter** at weight 800 is the closest Figtree alternative; **Space Mono** uppercase carries the Martian Mono role at slightly tighter spacing.

## Layout

### Spacing System

- **Base unit:** 4px (with 12px as the dominant gap value — 37 occurrences).
- **Tokens:** `{spacing.xs}` 4px · `{spacing.sm}` 8px · `{spacing.base}` 12px · `{spacing.md}` 16px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.2xl}` 48px · `{spacing.3xl}` 64px · `{spacing.4xl}` 96px.
- **Section padding (vertical):** 96px on the hero band, 64px between major sections below the fold (captured 6 times as `96px 0px` and 3 times as 64px on section margins).
- **Card internal padding:** 24px on the dark editorial cards below the fold; 16px on the smaller hairline-bordered feature cards.
- **Button padding:** 10x17px on the primary pill CTA (captured 6 times); 8x12px on secondary nav-link hovers.

### Grid & Container

- **Max content width:** ~1080px on the hero, ~1280px on the dark editorial cards section.
- **Hero block:** full-bleed dark canvas at 96px top/bottom, content centered at ~720px on the left with the illustration occupying the right half.
- **Below-fold sections:** centered displays at ~1080px, with feature cards splitting into 3-up at desktop and stacking to 1-up on mobile.
- **Dark editorial cards:** sit on the white body canvas as elevated `{colors.secondary}` panels — the surface contrast between near-black card and white canvas does the elevation work.

### Rhythm

The page's structural device is the **dark-light alternation.** Hero (dark) → logo wall (light) → "Build your way" editorial (light) → dark prompt-preview card (dark) → "For every kind of web app" editorial (light) → "Start your way" footer-adjacent (light). The dark editorial cards inside the light body act as in-body returns of the hero canvas — a visual reminder that the platform identity sits on the dark side, while the marketing copy lives on the light side.

## Elevation

The system has **two shadow tiers and one tonal-lift tier.** Most cards on the white canvas use the soft `{colors.surface-1}` border at #e4f0fb to read as elevated without a shadow draw; the dark editorial cards lift off the white canvas by surface-contrast alone (the ~95% lightness gap between `{colors.canvas}` and `{colors.secondary}` makes any shadow redundant).

- **Flat (no shadow):** hero, body bands, feature cells, logo wall — 95% of surfaces.
- **Hairline elevation:** white cards on white canvas with a 1px `{colors.surface-1}` border carry the soft-tinted hairline that reads as elevation.
- **Tonal lift:** `{colors.secondary}` dark editorial cards lift off the white canvas by surface-color contrast — no shadow drawn.

## Shapes

The radius scale is **small-step plus pill.**

- **Small-step:** `{rounded.xs}` 2px (2 occurrences), `{rounded.sm}` 4px (23 — the dominant card and input radius), `{rounded.md}` 6px (8 — icon buttons), `{rounded.lg}` 8px (1 — outlier), `{rounded.xl}` 12px (3 — larger feature cards), `{rounded.2xl}` 16px (1 — outlier on the largest card).
- **Pill:** `{rounded.pill}` 360px (6 — the primary CTA, secondary nav buttons, all the "rounded" interactive surfaces) and 50% (4 — circular avatar chips). The 360px value renders as a fully-rounded pill on any element shorter than 720px tall.
- **No middle tier in heavy use:** the scale concentrates at 4px and at the full pill; 8 / 12 / 16px appear only as outliers.

The pill treatment carries the brand voltage. The primary CTA pill at `{rounded.pill}` is filled with `{colors.primary}` cyan; secondary pills sit as transparent surfaces with a 1px ink border in `{colors.canvas-dark}` on the dark hero and `{colors.ink}` on the white body.

## Components

**`button-primary`** — The signature CTA. Teal-cyan `{colors.primary}` fill, near-black `{colors.ink}` text, fully-rounded pill at `{rounded.pill}`, 10x17px padding, 40px height, Figtree weight 600 at 18px. "Get started" is the canonical instance, sitting at the center of the hero stack.

**`button-primary-hover`** — Flips to the brighter `{colors.primary-hover}` (#8efbf7) on hover, with the same ink text. The single hover state in the captured system.

**`button-secondary`** — Transparent fill with ink text and a 1px ink border, same pill radius and dimensions as primary. Used as the "View account" secondary CTA on the dark hero.

**`button-dark-secondary`** — Deep teal-charcoal `{colors.secondary}` fill, white text, same pill geometry. Used as the in-card CTA on the dark editorial cards below the fold.

**`top-nav`** — Dark `{colors.canvas-dark}` surface that matches the hero canvas — the nav merges visually into the hero band rather than sitting as a separate strip. 12x16px padding, 56px height.

**`nav-link`** — Transparent fill, white text in `{typography.nav-link}`, 8x12px padding, `{rounded.md}` 6px hover-surface pill.

**`hero-section`** — Full-bleed `{colors.canvas-dark}` band, 96x0 padding, no border-radius. Holds the hero h1 in white at `{typography.display-xl}`, a single-line sub-paragraph in `{typography.body-lg}`, the cyan CTA pill stack, and the hand-drawn cart illustration on the right.

**`hero-heading`** — White `{colors.canvas}` text on the dark hero, Figtree 64px / 800, 0 letter-spacing. The display tier — confidence by weight, not by tracking.

**`section-heading`** — Same `{typography.display-xl}` token but rendered in ink `{colors.ink}` on the white canvas below the fold. "Build your way. Ship on one platform." and "For every kind of web app." are the canonical instances.

**`body-paragraph`** — `{colors.ink-muted}` running-text at `{typography.body-md}` — the workhorse paragraph style. Notable that the body color is the muted #545a61 rather than the heading #181a1c — a deliberate softness in the running text.

**`eyebrow-label`** — Cobalt-link `{colors.link}` color, Martian Mono uppercase at 16px / 400, 0 letter-spacing. The single most-distinctive small-caps treatment in the system. "WAY IT WORKS", "USE CASES", "PLATFORM" are the canonical instances.

**`card-dark`** — Deep teal-charcoal `{colors.secondary}` fill, white text, `{rounded.xl}` 12px radius, 24px internal padding, optional 1px `{colors.primary}` cyan border on the most-emphasized cards. The in-body return of the hero canvas; holds prompt-preview demos, agent-primitive diagrams, and the speedometer-globe panels.

**`card-light`** — White `{colors.canvas}` fill, ink text, `{rounded.xl}` 12px radius, 24px padding, 1px `{colors.surface-1}` border. The hairline-bordered feature card on the white canvas.

**`text-input`** — White surface, ink text, 1px `{colors.ink-weak}` border, `{rounded.sm}` 4px radius, 8px padding, 38px height. Used in the email-signup row of the footer.

**`code-block`** — Deep teal-charcoal `{colors.secondary}` fill, white text in `{typography.code-mono}` (Martian Mono 12px / 400), `{rounded.md}` 6px radius, 16px padding. Syntax colors are `{colors.syntax-cyan}` and `{colors.syntax-purple}` borrowed from a Night Owl-style theme.

**`footer`** — White `{colors.canvas}` surface, muted-grey text, 48x24px padding. Sits on the same canvas as the body — no surface contrast against the page floor.

## Do's and Don'ts

**Do** stitch the dark hero and the light body with the cyan pill. The single object that runs across both surface eras is the `{colors.primary}` CTA — removing the pill from one half breaks the visual through-line and turns the page into two unrelated landing strips.

**Do** run all three typefaces. Figtree for display, Instrument Sans for body, Martian Mono for uppercase eyebrows — each has a different job and each appears with distinctive frequency in the captured page. Replacing Martian Mono with an uppercase-tracked Figtree turns the page into a generic SaaS marketing surface.

**Do** dial the display tier to weight 800. The 64px hero h1 sits at weight 800, not the 500-600 most peers run; bumping down to 600 makes the chunky-confident feel collapse into Stripe-style restraint, which is the wrong identity for this product.

**Do** use `{colors.secondary}` (#0c2a2a) for in-body dark editorial cards — not pure black, not a generic charcoal. The deep teal-charcoal is part of the brand voltage system; substituting a flat grey or pure black removes the teal undertone that ties the dark surface back to the cyan primary.

**Don't** render the brand cyan as text or border. `{colors.primary}` (#32e6e2) appears 0 times as text and 0 times as border in the captured page — it is reserved exclusively for CTA pill fills and one in-card emphasis border. Using cyan as a link color or a body accent dilutes the single chromatic anchor.

**Don't** use the syntax colors (`{colors.syntax-cyan}` #89ddff, `{colors.syntax-purple}` #c792ea) anywhere outside code blocks. They are borrowed Night Owl theme values for the embedded code snippets, not part of the brand palette.

**Don't** introduce a 8px or 16px middle radius tier on cards. The system concentrates radii at 4px (small-step cards / inputs) and at the full pill — adding a middle value softens the binary contrast between body chrome and the warm pill surfaces.

**Don't** swap Martian Mono for a sans uppercase. The mono uppercase eyebrow is the system's quiet technical voice — replacing it with a tracked sans turns "WAY IT WORKS" into a generic marketing tag rather than a developer-flagged section label.

## Known Gaps

- **Dark mode:** the page already runs both a dark hero and a light body, so a full dark-mode variant would need a parallel light-hero / dark-body inversion that the captured site does not expose. Product surfaces carry a separate dark token set not represented here.
- **Hover and focus states:** documented for `{component.button-primary-hover}` only; the full state matrix (focus rings, active press, disabled tints, error fills) is not visible on the captured marketing surface.
- **Form input states:** `{component.text-input}` carries the resting state at the footer email-signup field; error / validation styling lives inside the dashboard and is not exposed here.
- **Product domain colors:** the CSS root declares `--color-brand-create-1`, `--color-brand-create-2` (which resolves to `{colors.warn}`), `--color-brand-connect-1`, and `--color-brand-connect-2` (which resolves to `{colors.link}`) as product-domain identifiers ("Create" and "Connect" product surfaces) but they appear 0 times in the captured render outside the CSS root.
- **Motion:** the hero illustration and the prompt-preview animation are interactive but the spec captures end-state values only. Easing curves and duration live in the live JavaScript.
- **Customer testimonial typography:** the page's blockquote tier (the "I can push a change…" pull-quote) runs at Figtree 48px / 700 — captured but not as a primary typography token because it appears only once.
