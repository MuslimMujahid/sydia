---
name: ui-hygiene
description: >
  Keep interfaces focused, clear, and proportionate to the user's task. Use when
  designing, generating, reviewing, or modifying UI to reduce unnecessary content,
  choose the right level of visual representation, apply progressive disclosure,
  and select the right interaction surface without harming clarity, discoverability,
  or accessibility.
---

# UI Information Hygiene

Design around the user's current task, not around the amount of available data, components, or implementation structure.

The goal is not visual minimalism. The goal is to minimize the total cost of understanding, finding, deciding, and acting.

## Core principle

Every visible element should materially help the user:

- understand location or current state,
- make a decision,
- perform an action,
- avoid or recover from a mistake,
- find relevant information,
- understand an important constraint.

If it does not, remove it.

## Start from the user task

Before designing a screen, define its primary purpose in one sentence.

Classify candidate information and actions as:

1. primary,
2. required supporting,
3. secondary,
4. supplemental.

Primary and required supporting elements should normally remain directly visible. Secondary and supplemental elements are candidates for simplification or progressive disclosure.

Do not let backend schemas, API responses, component libraries, or visual trends determine the information architecture.

## Prefer relevance over completeness

A UI does not need to expose everything the system knows.

Show information when it is relevant to the current task, decision, state, or constraint. Keep secondary information available only when users are likely to need it.

Do not display information merely because it exists, is technically accurate, or may be useful elsewhere.

## Match prominence to importance

The visual hierarchy should make the primary task, primary action, and important state easy to identify.

Prefer hierarchy through layout, spacing, typography, grouping, and contrast before adding containers, badges, cards, or decoration.

Do not give secondary information or actions equal visual weight to primary ones.

## Choose the least complex representation that remains clear

Reduce visual representation only when semantic clarity, discoverability, accessibility, and task efficiency are preserved.

### Representation matrix

| Representation            | Prefer when                                                                                                                                                           | Avoid when                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Label-only**            | Wording is concise and precise; the concept is abstract or uncommon; an icon adds little recognition value                                                            | An established icon materially improves scanning or repeated use                                      |
| **Icon + label**          | The action is important, unfamiliar, consequential, or benefits from both recognition and explicit meaning                                                            | The icon is purely decorative or space is severely constrained in a dense repeated control set        |
| **Icon-only**             | The symbol is highly familiar in context; space is materially constrained; the action is compact or frequently repeated; misinterpretation is low-risk and reversible | Meaning is ambiguous, novel, destructive, infrequent, or depends on a tooltip for basic comprehension |
| **Compact text control**  | The action remains clear with reduced padding, emphasis, or width                                                                                                     | Compactness weakens target size, hierarchy, or readability                                            |
| **Full-emphasis control** | The action is primary, high-value, time-sensitive, or deserves immediate attention                                                                                    | The action is secondary or one among many equivalent options                                          |
| **Visible metadata**      | The information changes decisions, supports comparison, or explains current state                                                                                     | It is merely descriptive, redundant, or unrelated to the present task                                 |
| **Abbreviated metadata**  | Users only need a quick signal and the shortened form is unambiguous                                                                                                  | Precision is needed for comparison, compliance, troubleshooting, or decision-making                   |

### Minimal-representation rules

- Treat text as the semantic baseline.
- Do not remove labels merely to make the interface look cleaner.
- Do not invent icons for concepts without a stable, recognizable visual convention.
- Do not use tooltips as a substitute for visible meaning.
- Every icon-only control must still have an accessible name and sufficient target size.
- Reduce prominence before reducing meaning.

## Use progressive disclosure deliberately

Collapsing content trades visibility for lower visual density and higher interaction cost. Use it only when that trade is beneficial.

### Disclosure matrix

| Pattern                             | Prefer when                                                                                                 | Avoid when                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Always visible**                  | Information or action is primary, frequently used, required, time-sensitive, or needed for comparison       | It is rarely used and competes with the primary task                                               |
| **Accordion / collapsible section** | Content is secondary, separable, predictable from its heading, and users usually need only a subset at once | Users need to compare sections, read most sections sequentially, or repeatedly open and close them |
| **Overflow menu**                   | Actions are secondary or occasional and can be safely hidden behind a visible trigger                       | Primary or frequently used actions would become harder to discover                                 |
| **Context menu**                    | Actions are specific to the selected object or local context and are not the main workflow                  | The action is global, essential, or needs persistent discoverability                               |
| **Expandable details**              | Supplemental explanation or metadata is useful on demand but not needed for the default task                | Hidden content affects safety, current state, required decisions, or task completion               |
| **Responsive collapse**             | Lower-priority items need to move out of the primary layout as width decreases                              | Important items are hidden simply because they happen not to fit                                   |

### Disclosure rules

Keep directly visible:

- primary actions,
- frequently used controls,
- required information,
- important current state,
- errors and warnings that need attention,
- information needed for comparison,
- constraints needed for safe or informed decisions.

Collapse only when the visible trigger gives enough information scent for users to predict what is hidden.

Rank content and actions before collapsing them. Do not use overflow as a generic storage area for unresolved prioritization.

## Choose the right interaction surface

Keep content inline by default. Move it elsewhere only when another surface has a concrete interaction advantage.

Choose based on importance, complexity, interruption cost, context dependence, persistence, reversibility, navigation needs, and screen size.

### Surface-selection matrix

| Surface                            | Prefer when                                                                                                                  | Avoid when                                                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Inline**                         | The information or action belongs directly to the current task; preserving context is valuable; no isolation is needed       | The interaction would overwhelm the page or genuinely requires focused isolation                            |
| **Tooltip**                        | Information is brief, supplemental, nonessential, and closely tied to one element                                            | The information is required, complex, actionable, or needed on touch without an equivalent access path      |
| **Popover**                        | A small amount of contextual information or lightweight interaction should stay close to its trigger                         | The content becomes essential, lengthy, multi-step, or hard to operate in a transient layer                 |
| **Menu**                           | A compact set of secondary actions or navigation choices should be hidden until requested                                    | Users need persistent information, complex inputs, comparison, or a long workflow                           |
| **Drawer / side panel**            | Secondary work needs more room while preserving relationship to the underlying context                                       | The task is independent, navigational, or does not benefit from seeing the parent context                   |
| **Dialog / modal**                 | The user must focus on a short, bounded, blocking task or consequential decision before continuing                           | The task is routine, long, multi-step, research-heavy, or requires frequent reference to the background     |
| **Dedicated page**                 | The task is complex, long-lived, multi-step, navigational, independently revisitable, or needs stable history and wayfinding | The interaction is brief and strongly dependent on the current context                                      |
| **Wizard / stepper**               | A complex task has a clear sequence, meaningful dependencies, and benefits from reducing simultaneous choices                | Steps are artificial, users need free movement among sections, or the entire task can be understood at once |
| **Banner / message bar**           | A persistent state or warning affects the current surface or many actions within it                                          | The message is transient, low-priority, or unrelated to most of the current surface                         |
| **Toast / transient notification** | A brief result or confirmation does not require immediate action and can disappear safely                                    | The user must respond, retain the information, or resolve an error before continuing                        |

### Surface-selection rules

- Use the least interruptive surface that still fits the task.
- Do not promote content into a modal merely to make it more noticeable.
- Use modality only when blocking the underlying task is part of the requirement.
- Prefer a drawer when users benefit from referencing the parent context while working.
- Prefer a page as complexity, duration, navigation, or revisitation needs increase.
- Do not allow transient surfaces to grow into miniature applications.
- Avoid stacking transient surfaces when normal navigation would be clearer.
- On compact screens, preserve the interaction goal even if the component type must change.

## Do not over-containerize

Do not create cards, panels, sections, tabs, badges, or wrappers unless they communicate a meaningful relationship, state, hierarchy, or interaction boundary.

Grouping should clarify structure, not decorate it.

Prefer a simpler layout when additional structure does not improve comprehension or navigation.

## Avoid redundant explanation

Do not repeat information already communicated by headings, labels, layout, visible state, or surrounding context.

Add explanatory copy only when it reduces ambiguity, communicates consequences, explains an unfamiliar concept, supports a decision, or helps recovery.

## Use the user's mental model

Prefer terminology and concepts that match how users understand the task.

Keep implementation details, internal identifiers, diagnostics, infrastructure terminology, and system structure out of ordinary UI unless the user's task specifically requires them.

## Show state only when it matters

Status, progress, availability, and system state should be visible when they reduce uncertainty or affect the user's next action.

Do not expose every tracked state merely because it exists.

Use prominent status treatments only for information that deserves immediate attention.

## Design empty, loading, and error states proportionately

State-specific UI should communicate only what the user needs to understand and continue.

Errors should prioritize:

- what happened,
- what is affected,
- what the user can do next,
- whether retry or another recovery path is available.

Avoid elaborate empty states, filler copy, or diagnostic detail when they do not help the user act.

## Preserve important constraints

Simplicity must not remove information users need to make safe or informed decisions.

Surface constraints when they materially affect the current action, especially around:

- irreversible actions,
- cost or billing,
- limits or availability,
- permissions or access,
- privacy or security,
- data loss or retention,
- legal or compliance requirements.

## Accessibility is a boundary

Do not reduce visible UI in ways that make the interface harder to perceive, understand, or operate.

Whenever an element is minimized, collapsed, moved, or made transient, verify:

- accessible names are present,
- visible labels and accessible names remain aligned,
- keyboard access still works,
- focus remains visible and correctly managed,
- interactive targets remain sufficiently large and separated,
- required contrast is preserved,
- essential information is not hover-only,
- disclosure states are communicated programmatically,
- modal focus is contained and restored correctly.

Do not treat ARIA labels as a substitute for visible clarity.

## Agent workflow

When generating or modifying UI:

1. Define the screen's primary user goal.
2. Identify the minimum information required to complete it safely and confidently.
3. Rank information and actions by importance and frequency.
4. Establish visual hierarchy before adding containers or decoration.
5. Use the representation matrix to choose the least complex clear representation.
6. Use the disclosure matrix to decide what remains visible and what can be collapsed.
7. Use the surface-selection matrix before introducing menus, drawers, dialogs, or pages.
8. Remove unrelated, redundant, speculative, or implementation-driven content.
9. Review empty, loading, error, disabled, and restricted states.
10. Run an accessibility pass after every reduction in visibility or increase in interaction indirection.
11. Remove any element whose absence would not meaningfully reduce usability, comprehension, trust, safety, or task completion.

## Review matrix

| Question            | Pass condition                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| **Purpose**         | The element directly supports the current task, decision, state, or constraint                        |
| **Priority**        | Its visual weight matches its importance and frequency                                                |
| **Representation**  | No simpler representation would preserve equal clarity and usability                                  |
| **Discoverability** | Users can find and understand it without guessing                                                     |
| **Disclosure**      | Hidden content is genuinely secondary and predictable from its trigger                                |
| **Surface**         | The chosen UI primitive matches the task's complexity, context, and interruption needs                |
| **Context**         | Moving or hiding the element does not remove information users still need                             |
| **Redundancy**      | The same meaning is not already communicated elsewhere                                                |
| **Actionability**   | The element helps the user decide, act, understand, or recover                                        |
| **Accessibility**   | The chosen representation remains perceivable, understandable, and operable                           |
| **Omission**        | Removing it would cause a meaningful usability, comprehension, trust, safety, or task-completion loss |

If the omission test fails, remove the element.

## Default behavior

When uncertain, prefer the least complex and least prominent representation that still preserves clarity, discoverability, accessibility, and task completion.

Optimize for:

- relevance over completeness,
- clarity over pixel reduction,
- hierarchy over equal emphasis,
- direct access for primary tasks,
- progressive disclosure for genuinely secondary content,
- inline presentation over unnecessary overlays,
- the right surface over the most visually convenient component,
- user concepts over system concepts,
- purposeful structure over excessive containers,
- accessibility over visual minimalism,
- usability over novelty.

A successful interface makes important things obvious, secondary things available without distraction, and unnecessary things absent.
