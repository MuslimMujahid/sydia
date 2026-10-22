# Settings billing — built surface

## Overview

`/settings/billing` extends the existing settings area with subscription status, a manual Mayar payment flow, storage usage, and payment history. Product authority remains [PRODUCT.md](../../apps/frontend/PRODUCT.md); visual authority remains [Aurora Haze](../../DESIGN.md). Indonesian and English copy use the account locale, with dates displayed in the account timezone.

**THESIS:** Understand current access and renew through one payment flow. **OWN-WORLD:** Existing Aurora settings styling and shared controls. **STORY:** Access state, price and payment, then storage and history. **FIRST VIEWPORT:** Settings navigation, subscription state and end date, current price beside a struck-through regular price when discounted, concise inclusions and renewal terms, and the billing phone field with its invoice action. **FORM:** One open content column with hairline-separated supporting sections.

## Colors

The page inherits the bone canvas, dark ink, muted supporting text, hairlines, and shared Aurora controls. The invoice action uses the existing grainy Aurora treatment with a dark overlay behind its white label. Storage uses a coral progress value on a neutral track. The expired-access banner uses a quiet neutral surface and an underlined renewal link. These treatments are scoped uses of the incumbent system and introduce no global tokens.

## Typography

Inter carries the hierarchy: the existing page heading, semibold access and section headings, a prominent current price (30px), regular body text, and smaller supporting terms and field help (14px). Prices and usage values use tabular numerals. The regular price is struck through only when the current price is lower.

## Layout

**The One Payment Flow Rule.** One billing column (maximum width 768px) follows the current settings navigation: a vertical rail on desktop and a horizontally scrollable row on mobile. The billing phone form is narrower (maximum width 384px). Price, terms, actions, and history rows wrap as needed rather than introducing a mobile pricing layout.

Storage and payment history remain below the access/payment section, separated by hairlines. The storage section contains one numeric usage statement and one slim native progress bar. History is a simple list of amounts, states, and dates, with a concise empty state. The expired banner sits above the settings content and wraps its message and renewal link on mobile.

## Components

The access section supports payments-disabled, trial-active, subscription-active, and expired states. It displays the trial end or paid-through date as appropriate; expired access uses an explicit past-tense date label and a short explanation that reading, downloading, and deleting remain available. In sandbox mode with checkout enabled, a visible test-payment notice precedes the access section.

The invoice form has a visible telephone label, country-code guidance, native validation, and an amount-bearing submit action. Invoice preparation disables the field and submit action. An existing creating, pending, or review invoice replaces the form with its state. Pending invoices expose **Pay with Mayar** in a new tab and a secondary **Check payment** action. Review state asks the user to contact support and avoid another payment. History does not duplicate the primary pending invoice's payment actions.

Subscription and history reads have explicit loading, error, and retry states. Checkout and refresh failures appear inline; failed invoice creation has its own alert. When history cannot load, invoice creation is withheld until the user retries successfully. The shared access banner is hidden for active access, shows a renewal link for expired access, and exposes a retry when subscription status fails to load.

## Do's and Don'ts

- **Do** preserve the single-plan payment flow, visible access state and end date, manual-renewal terms, and concise storage/history sections.
- **Do** retain equivalent Indonesian and English states and account-timezone dates.
- **Do** keep loading, failures, payment review, and recovery visible.
- **Don't** add plan tiers, message counters, or product quota meters.
- **Don't** promote this surface's composition or scoped CTA treatment into the global design system.

Built evidence: [trial desktop](../review/desktop.png), [trial mobile](../review/mobile.png), [expired desktop](../review/expired-desktop.png), and [expired mobile](../review/expired-mobile.png). These screenshots show Indonesian sandbox fixtures with empty payment history; other documented states are grounded in `billing-page.tsx` and `billing-access-banner.tsx` in `apps/frontend/src/components/settings`, with route ownership in `apps/frontend/src/routes/_app.settings.billing.tsx`.

Reviewer disposition: **ship** after the three material findings were resolved. This brief records the built settings extension without changing `DESIGN.md` or its global sidecar.
