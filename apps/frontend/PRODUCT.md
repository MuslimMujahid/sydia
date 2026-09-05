# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Sydia primarily serves Indonesian individuals who already use WhatsApp heavily and need lightweight personal organization without adopting a complex productivity system. Initial users include knowledge workers, freelancers, small-business operators, students, and professionals managing appointments, files, deadlines, contacts, and reference information.

Their core jobs are to capture information immediately, turn messages into reliable actions, retrieve information without remembering where it was stored, understand documents and media, follow through on obligations, and review important state in one place.

## Product Purpose

Sydia is a chat-first personal productivity and memory service. Users send natural-language messages, documents, images, and voice notes to one assistant, primarily through WhatsApp. Sydia turns actionable requests into structured tasks, reminders, events, and contacts, and stores useful knowledge as searchable, user-controlled memory.

Success means reducing the effort required to capture and recover personal information while reliably completing or tracking intended actions. The web dashboard supports review, correction, organization, settings, and data management rather than replacing the conversational workflow.

## Positioning

Sydia is a personal assistant that remembers and follows through, not a generic AI chatbot. Its distinguishing mechanism is conversational capture backed by inspectable, deterministic application state and curated memory with provenance. AI interprets intent, but application data and confirmed provider results remain the source of truth.

## Operating Context

- WhatsApp is the primary conversational channel and uses one shared Sydia business identity; each user's sender identity maps to their Sydia account.
- The web app is a secondary control center for Today, activity, tasks, reminders, calendar, memory, files, contacts, settings, privacy, and billing.
- Typical inputs include short messages, voice notes, screenshots, images, and documents such as invoices.
- Typical workflows span capture, action confirmation, correction, semantic retrieval, document understanding, scheduled reminders, daily briefings, and completion follow-ups.
- Google Calendar is the planned MVP calendar integration. Telegram, team workflows, and advanced automations are post-MVP.

## Capabilities and Constraints

- MVP capabilities include account authentication, WhatsApp linking, web chat, natural-language assistance, memories and notes, hybrid search, reminders, tasks, contacts, document and image understanding, voice transcription, Google Calendar, and opt-in daily briefings.
- Tasks, reminders, events, contacts, billing, and subscription entitlements are deterministic structured state. The assistant must not claim an action succeeded until its tool or external provider confirms success.
- Conversation history is archival context, not durable memory. Long-term memory is curated, inspectable, correctable, deletable, and linked to source provenance.
- The dashboard must expose concise action state and low-friction edit, undo, cancel, complete, snooze, and reschedule paths without exposing prompts, vector scores, or raw model data.
- Users must remain isolated from one another at every data and retrieval boundary. Sensitive conversation and document content must not be sent to analytics by default.
- Bahasa Indonesia is first-class, and multilingual support must be preserved.
- Pricing, packaging, provider selections, usage limits, retention periods, automatic-memory defaults, proactive-follow-up defaults, and the degree of web-chat parity with WhatsApp remain open product decisions.

## Brand Commitments

The product name is Sydia. Product language should be concise, action-oriented, transparent about interpreted state, and clear about whether information was retrieved, suggested, or acted upon. The assistant should feel proactive but restrained and should ask for clarification only when a required field is materially ambiguous.

## Evidence on Hand

- `../../docs/Sydia_PRD.md` contains the approved product scope, users, journeys, requirements, success metrics, release strategy, and open decisions.
- `../../docs/Sydia_System_Architecture.md` defines the approved system boundaries and product invariants that affect the frontend.
- `../../docs/Sydia_Implementation_Roadmap.md` tracks the planned frontend and backend delivery phases.
- The repository currently contains no approved testimonials, customer logos, case studies, pricing, or launch claims. Future work must not fabricate them.

## Product Principles

- Conversation first: common actions should be possible without opening the dashboard.
- Reliable follow-through: convert intent into deterministic, confirmed actions with easy correction.
- Curated memory: preserve useful knowledge with provenance and user control, not transcript dumping.
- Explainable state: make saved information and created actions inspectable and correctable.
- Proactive but restrained: notify only when there is clear user benefit and provide simple completion, snooze, dismissal, or rescheduling.

## Accessibility & Inclusion

The web dashboard targets WCAG 2.1 AA where practical. Interfaces must preserve keyboard access, semantic structure, readable state and error communication, and responsive use across desktop and mobile web. Bahasa Indonesia is first-class, and layouts and copy must remain suitable for multilingual expansion.
