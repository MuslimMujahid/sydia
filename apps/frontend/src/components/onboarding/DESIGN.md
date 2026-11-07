---
name: "Aurora Haze · Sydia onboarding"
description: "Quiet personalization with a welcoming, deliberately scoped aurora completion."
colors:
  brand: "#ef5a8a"
  ink: "#171419"
  ink-muted: "#6b6470"
  background: "#fbf8f5"
  canvas: "#ffffff"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontWeight: 700
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontWeight: 400
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontWeight: 600
rounded:
  sm: "10px"
  md: "16px"
  lg: "22px"
  pill: "9999px"
components:
  button-outline:
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 22px"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "44px"
  card:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.lg}"
---

# Design System: Aurora Haze · Sydia onboarding

## Overview

**Creative North Star: "Aurora Haze"**

This scoped guide describes the onboarding components and their completion scene. It inherits the established [Aurora Haze system](../../../../../DESIGN.md), the app's shared primitives, and the approved Penpot layout direction. It does not replace the global design system.

Personalization stays quiet: warm bone-white space, clear graphite headings, restrained coral state cues, and familiar controls. Completion gives that same world a warmer welcome through the selected persona, a soft coral–peach–violet bloom, and sparse celebratory particles.

**Key Characteristics:**

- Calm task surfaces with one clear next action.
- Inter throughout, with bold headings and quieter supporting copy.
- Personal identity expressed through existing persona artwork.
- A celebratory completion that remains readable and accessible.

## Colors

### Primary

Coral brand color connects progress, selection, and the existing grainy aurora primary button. Use the shared gradient recipe rather than constructing a new CTA palette.

### Neutral

Graphite ink carries headings and field values. Muted ink carries descriptions; bone-white is the page ground and white is the form surface. Fine ink borders establish groups without competing with the task.

**The Readable Welcome Rule.** Preserve the completion heading's darker rose emphasis. The bright coral used for decorative particles and selection accents is not the headline text treatment; check text against the brightest and darkest parts of the moving bloom.

## Typography

Inter serves both display and body roles. Setup headings are bold, tightly tracked, and left aligned. Completion uses a larger centered heading, balanced wrapping, a short supporting paragraph, and a single primary action. Supporting copy remains visibly quieter than headings while retaining readable contrast.

Keep the responsive hierarchy already implemented; avoid promoting this scene's individual sizes or line breaks into a new application type scale. Labels use semibold weight, and guidance uses regular body weight.

## Layout

Setup presents one task at a time in a centered column. A compact segmented progress indicator provides orientation above the current heading. White containers hold fields and channel setup; the persona choice uses an open canvas so its fan of illustrations can breathe.

Retain the approved four-step sequence: language and timezone, preferred form of address, persona, then optional messaging channel. Channel-specific instructions appear after selection, with back and skip actions kept discoverable. Billing does not become an extra stage of this onboarding sequence.

On narrow screens, preserve document flow, readable headings, usable controls, and wrapping action rows. The persona fan must remain selectable by keyboard and touch; its visual overlap must not hide the selected option's name or description. Completion remains a centered, viewport-filling scene with content above its decorative layers.

## Elevation & Depth

Reuse the app's soft card and button shadows. Thin borders and white surfaces give forms their structure; selected choices use a coral border and faint tint. Completion's blurred bloom and persona ring provide ambient depth without adding another card around the message.

## Shapes

Use the established softly rounded fields, controls, and cards. Pill geometry belongs to progress segments, radio indicators, and the circular completion portrait. Keep persona illustrations intact rather than replacing them with generic icons or emoji.

## Components

### Form controls and navigation

Reuse shared inputs, selects, radios, cards, and buttons, including their hover, focus-visible, disabled, and invalid states. Keep visible labels and concise helper text. Focus moves to the new step heading so keyboard and assistive-technology users receive the same orientation as sighted users.

The gradient primary action advances or finishes the current task. Outline back actions and quiet underlined skip or switch actions stay secondary. Errors remain near the relevant action and preserve a visible path to retry.

### Persona fan

Use the shared persona collection for both the choice and completion portrait. Selection has an explicit radio state, a visual emphasis, and a readable name and description. The artwork conveys personality; it must not become the only way to identify an option.

### Optional channel setup

Reuse the settings integration components in their onboarding presentation. Reveal the selected channel's connection and verification instructions progressively. Show connected state only after the provider-backed status confirms it; a user may skip setup and continue.

### Completion scene

The selected persona sits in a circular aurora ring with a confirmation badge. The greeting, saved-settings message, and primary chat action carry the foreground. Decorative bloom and particles sit behind them, ignore pointer input, and remain hidden from assistive technology.

**The Scoped Celebration Rule.** The user-authorized animated coral–peach–violet bloom, persona ring, and deterministic confetti are an exception for this completion scene to the global restraint on gradient placement and motion. Do not propagate this exception to setup steps, settings, or unrelated product surfaces.

Retain the scene's finite deterministic particle set rather than generating random decoration on each render. Respect reduced-motion preferences by removing animations, and pause animation while the document is hidden. The welcome remains complete and understandable without motion.

The primary action opens a new conversation and queues the greeting in the preferred language. Keep its pending state, visible retry error, and idempotent retry behavior; a decorative success scene must not conceal failure to start the chat.

## Do's and Don'ts

### Do:

- **Do** inherit Aurora Haze and existing shared controls before introducing a new visual primitive.
- **Do** keep the completion message and action readable over every bloom state.
- **Do** preserve keyboard selection, visible focus, reduced-motion behavior, and hidden-document pausing.
- **Do** carry the selected persona into the completion scene.

### Don't:

- **Don't** extend the completion gradient and motion exception to unrelated surfaces.
- **Don't** make channel linking or billing an added barrier to finishing this personalization flow.
- **Don't** replace confirmed connection state or chat-start errors with decorative success claims.
- **Don't** turn individual particle positions, portrait dimensions, or animation delays into application-wide tokens.
