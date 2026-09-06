# Sydia — Implementation Roadmap

> Tracking-oriented roadmap for the Sydia MVP.  
> Detailed product and technical specifications are defined in the PRD and System Architecture Document.

---

# Phase 0 — Project Foundation

## Backend

- [x] BE-0001 Initialize NestJS backend
- [x] BE-0002 Set up PostgreSQL and Prisma
- [x] BE-0003 Establish API application structure
- [x] BE-0004 Set up environment configuration
- [x] BE-0005 Set up logging baseline
- [x] BE-0006 Set up CI/CD
- [x] BE-0007 Set up staging environment

## Frontend

- [x] FE-0001 Initialize TanStack Start frontend
- [x] FE-0002 Set up application routing
- [x] FE-0003 Set up API client layer
- [x] FE-0004 Create dashboard shell
- [x] FE-0005 Create shared UI foundation
- [x] FE-0006 Set up loading, error, and empty states
- [x] FE-0007 Set up frontend CI/CD

## Phase Exit

- [x] API deploys successfully
- [x] Frontend deploys successfully
- [x] PostgreSQL is connected
- [x] Staging environment is usable

---

# Phase 1 — Account, Authentication, and Identity

## Backend

- [x] BE-0101 Create User domain
- [x] BE-0102 Implement authentication
- [x] BE-0103 Implement user sessions
- [x] BE-0104 Create External Identity domain
- [x] BE-0105 Implement user preferences
- [x] BE-0106 Implement timezone and locale settings
- [x] BE-0107 Add account audit events
- [x] BE-0108 Add authorization guards

## Frontend

- [x] FE-0101 Create sign-up page
- [x] FE-0102 Create sign-in page
- [x] FE-0103 Implement sign-out flow
- [x] FE-0104 Create onboarding flow
- [x] FE-0105 Create profile settings
- [x] FE-0106 Create timezone and locale settings
- [x] FE-0107 Protect authenticated routes
- [x] FE-0108 Handle expired sessions

## Phase Exit

- [x] User can register
- [x] User can sign in and sign out
- [x] User profile and preferences are persisted
- [x] Protected routes are enforced

---

# Phase 2 — Conversational Core and Web Chat

## Backend

- [x] BE-0201 Create Conversation domain
- [x] BE-0202 Create Message domain
- [x] BE-0203 Create Conversation Summary domain
- [x] BE-0204 Create Assistant Run domain
- [x] BE-0205 Create Tool Invocation domain
- [x] BE-0206 Implement Model Gateway
- [x] BE-0207 Implement Assistant Orchestrator
- [x] BE-0208 Implement Context Builder
- [x] BE-0209 Implement conversation summarization
- [x] BE-0210 Create web chat API
- [x] BE-0211 Implement message idempotency
- [x] BE-0212 Implement assistant tool execution safeguards

## Frontend

- [x] FE-0201 Create web chat page
- [x] FE-0202 Create conversation list
- [x] FE-0203 Create message history view
- [x] FE-0204 Create chat composer
- [x] FE-0205 Add assistant loading state
- [x] FE-0206 Add assistant error and retry state
- [x] FE-0207 Create assistant activity/history view

## Phase Exit

- [x] User can chat with Sydia from the web
- [x] Conversations are persisted
- [x] Conversation summaries are generated when needed
- [x] Web chat is sufficient for developing and testing assistant features

---

# Phase 3 — Reminders and Tasks

## Backend

- [x] BE-0301 Set up Redis
- [x] BE-0302 Set up BullMQ
- [x] BE-0303 Establish worker process
- [x] BE-0304 Create Reminder domain
- [x] BE-0305 Create Reminder Schedule domain
- [x] BE-0306 Create Reminder Occurrence domain
- [x] BE-0307 Implement reminder scheduling
- [x] BE-0308 Implement recurring reminders
- [x] BE-0309 Implement reminder delivery
- [x] BE-0310 Implement reminder assistant tools
- [x] BE-0311 Create Task domain
- [x] BE-0312 Implement task assistant tools
- [x] BE-0313 Implement task/reminder reference resolution
- [x] BE-0314 Add reminder and task audit events

## Frontend

- [x] FE-0301 Create Reminders page
- [x] FE-0302 Create reminder detail/edit flow
- [x] FE-0303 Create Tasks page
- [x] FE-0304 Create task detail/edit flow
- [x] FE-0305 Add task filters
- [x] FE-0306 Add reminder filters
- [x] FE-0307 Create Today page
- [x] FE-0308 Add task/reminder chat action cards
- [x] FE-0309 Add snooze and complete actions
- [x] FE-0310 Add reschedule actions

## Phase Exit

- [x] User can create reminders via web chat
- [x] User can create recurring reminders
- [x] User can reschedule, snooze, and cancel reminders
- [x] User can create, update, and complete tasks
- [x] Tasks and reminders are manageable from the dashboard

---

# Phase 4 — Memory and Semantic Retrieval

## Backend

- [x] BE-0401 Enable pgvector
- [x] BE-0402 Create Memory domain
- [x] BE-0403 Implement explicit memory tools
- [x] BE-0404 Implement memory embeddings
- [x] BE-0405 Implement keyword search
- [x] BE-0406 Implement semantic search
- [x] BE-0407 Implement hybrid retrieval
- [x] BE-0408 Add memory retrieval to assistant context
- [x] BE-0409 Implement automatic memory extraction
- [x] BE-0410 Implement memory conflict handling
- [x] BE-0411 Implement memory supersession
- [x] BE-0412 Implement memory deletion and index cleanup
- [x] BE-0413 Add memory provenance

## Frontend

- [x] FE-0401 Create Memory page
- [x] FE-0402 Create memory search
- [x] FE-0403 Create memory detail view
- [x] FE-0404 Create memory edit flow
- [x] FE-0405 Add pin memory action
- [x] FE-0406 Add archive memory action
- [x] FE-0407 Add delete memory action
- [x] FE-0408 Show memory provenance
- [x] FE-0409 Add automatic-memory setting

## Phase Exit

- [x] User can explicitly save a memory
- [x] User can retrieve memories semantically
- [x] User can browse and manage memories
- [x] Updated memories supersede outdated information correctly
- [x] Deleted memories no longer appear in retrieval

---

# Phase 5 — Documents, Images, and Audio

## Backend

- [x] BE-0501 Set up object storage
- [x] BE-0502 Create File Asset domain
- [x] BE-0503 Create Document domain
- [x] BE-0504 Create Document Chunk domain
- [x] BE-0505 Implement file ingestion
- [x] BE-0506 Implement document parsing
- [x] BE-0507 Implement document chunking
- [x] BE-0508 Implement document embeddings
- [x] BE-0509 Implement document retrieval
- [x] BE-0510 Implement document provenance
- [x] BE-0511 Implement structured document extraction
- [x] BE-0512 Implement image understanding
- [x] BE-0513 Implement audio transcription
- [x] BE-0514 Route transcripts to assistant
- [x] BE-0515 Implement document deletion cleanup

## Frontend

- [x] FE-0501 Create Files page
- [x] FE-0502 Create file upload flow
- [x] FE-0503 Show file processing state
- [x] FE-0504 Create file detail view
- [x] FE-0505 Add ask-a-file interaction
- [x] FE-0506 Add document source references
- [x] FE-0507 Add chat file attachments
- [x] FE-0508 Add chat image attachments
- [x] FE-0509 Add audio upload/attachment support
- [x] FE-0510 Show audio transcripts
- [x] FE-0511 Add file deletion flow

## Phase Exit

- [x] User can upload a document
- [x] User can ask questions about documents
- [x] User can upload an image for understanding
- [x] User can upload audio for transcription and assistant processing
- [x] Document answers show provenance
- [x] Deleted files no longer appear in retrieval

---

# Phase 6 — Contacts and Google Calendar

## Backend

- [x] BE-0601 Create Contact domain
- [x] BE-0602 Implement contact assistant tools
- [x] BE-0603 Implement contact aliases
- [x] BE-0604 Implement contact resolution
- [x] BE-0605 Implement Google OAuth
- [x] BE-0606 Create Calendar integration domain
- [x] BE-0607 Implement calendar provider adapter
- [x] BE-0608 Implement calendar read operations
- [x] BE-0609 Implement calendar create operations
- [x] BE-0610 Implement calendar update operations
- [x] BE-0611 Implement calendar cancel operations
- [x] BE-0612 Implement calendar assistant tools
- [x] BE-0613 Implement calendar disconnect/revoke flow

## Frontend

- [x] FE-0601 Create Contacts page
- [x] FE-0602 Create contact detail/edit flow
- [x] FE-0603 Add contact search
- [x] FE-0604 Create Calendar page
- [x] FE-0605 Create Google Calendar connect flow
- [x] FE-0606 Show calendar connection status
- [x] FE-0607 Add calendar disconnect flow
- [x] FE-0608 Add calendar events to Today page

## Phase Exit

- [x] User can save and retrieve contacts
- [x] Sydia can resolve contacts conversationally
- [x] User can connect Google Calendar
- [x] User can view calendar events
- [x] User can create, update, and cancel events through Sydia

---

# Phase 7 — WhatsApp Integration

## Backend

- [ ] BE-0701 Integrate WhatsApp webhook
- [ ] BE-0702 Implement WhatsApp identity linking
- [ ] BE-0703 Implement WhatsApp inbound text handling
- [ ] BE-0704 Implement WhatsApp outbound messaging
- [ ] BE-0705 Implement WhatsApp inbound message idempotency
- [ ] BE-0706 Implement WhatsApp media ingestion
- [ ] BE-0707 Implement WhatsApp image handling
- [ ] BE-0708 Implement WhatsApp document handling
- [ ] BE-0709 Implement WhatsApp voice-note handling
- [ ] BE-0710 Implement WhatsApp conversation-window handling
- [ ] BE-0711 Implement WhatsApp template-message support
- [ ] BE-0712 Implement proactive reminder delivery over WhatsApp
- [ ] BE-0713 Add WhatsApp delivery-state tracking
- [ ] BE-0714 Add WhatsApp integration audit events

## Frontend

- [ ] FE-0701 Create WhatsApp connection page
- [ ] FE-0702 Create WhatsApp account-linking flow
- [ ] FE-0703 Show WhatsApp connection status
- [ ] FE-0704 Add WhatsApp unlink flow
- [ ] FE-0705 Show WhatsApp identity details
- [ ] FE-0706 Add WhatsApp connection errors and recovery states

## Phase Exit

- [ ] User can link WhatsApp to an existing Sydia account
- [ ] User can use core Sydia features from WhatsApp
- [ ] Text messages work
- [ ] Images work
- [ ] Documents work
- [ ] Voice notes work
- [ ] Reminder delivery works over WhatsApp
- [ ] Web chat and WhatsApp use the same assistant runtime

---

# Phase 8 — Proactive Assistant, Settings, and Privacy

## Backend

- [ ] BE-0801 Create notification abstraction
- [ ] BE-0802 Implement daily briefing
- [ ] BE-0803 Implement proactive follow-ups
- [ ] BE-0804 Implement notification preferences
- [ ] BE-0805 Implement global proactive pause
- [ ] BE-0806 Implement data export
- [ ] BE-0807 Implement conversation deletion
- [ ] BE-0808 Implement account deletion
- [ ] BE-0809 Implement integration revocation
- [ ] BE-0810 Implement data retention jobs
- [ ] BE-0811 Expand assistant preferences

## Frontend

- [ ] FE-0801 Create Assistant settings
- [ ] FE-0802 Create Notification settings
- [ ] FE-0803 Create Integrations settings
- [ ] FE-0804 Create Memory & Privacy settings
- [ ] FE-0805 Create Data settings
- [ ] FE-0806 Add daily briefing controls
- [ ] FE-0807 Add proactive messaging pause
- [ ] FE-0808 Add data export flow
- [ ] FE-0809 Add conversation deletion flow
- [ ] FE-0810 Add account deletion flow
- [ ] FE-0811 Refine Today/Home page

## Phase Exit

- [ ] User can enable daily briefing
- [ ] User can control proactive messaging
- [ ] User can manage privacy settings
- [ ] User can export or delete account data
- [ ] User can revoke connected integrations

---

# Phase 9 — Entitlements, Reliability, and Beta Hardening

## Backend

- [ ] BE-0901 Implement usage metering
- [ ] BE-0902 Implement entitlement service
- [ ] BE-0903 Add billing integration boundary
- [ ] BE-0904 Implement rate limiting
- [ ] BE-0905 Implement AI usage limits
- [ ] BE-0906 Implement file-processing limits
- [ ] BE-0907 Build AI regression test suite
- [ ] BE-0908 Build integration test suite
- [ ] BE-0909 Run authorization/security tests
- [ ] BE-0910 Run retrieval isolation tests
- [ ] BE-0911 Harden queue failure handling
- [ ] BE-0912 Harden provider failure handling
- [ ] BE-0913 Add operational dashboards
- [ ] BE-0914 Add operational alerts
- [ ] BE-0915 Configure database backups
- [ ] BE-0916 Perform restore test
- [ ] BE-0917 Finalize retention policy
- [ ] BE-0918 Finalize audit coverage

## Frontend

- [ ] FE-0901 Create Usage page
- [ ] FE-0902 Create Subscription page
- [ ] FE-0903 Add quota/limit states
- [ ] FE-0904 Add provider-disconnected states
- [ ] FE-0905 Standardize destructive confirmations
- [ ] FE-0906 Complete accessibility review
- [ ] FE-0907 Complete responsive review
- [ ] FE-0908 Add product telemetry
- [ ] FE-0909 Add assistant response feedback
- [ ] FE-0910 Add failed-action feedback
- [ ] FE-0911 Add support/contact entry
- [ ] FE-0912 Complete closed-beta UI polish

## Phase Exit

- [ ] Usage is metered
- [ ] Entitlements are enforced
- [ ] Critical security tests pass
- [ ] Cross-user retrieval tests pass
- [ ] Backup restore has been verified
- [ ] Operational alerts are active
- [ ] Product is ready for closed beta

---

# Release Milestones

## Milestone A — Internal Web Prototype

- [ ] Phase 0 complete
- [ ] Phase 1 complete
- [x] Phase 2 complete
- [x] Account creation works
- [x] Web chat works
- [x] Assistant context lifecycle works

---

## Milestone B — Core Personal Assistant

- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [x] Phase 5 complete
- [ ] Tasks work reliably
- [ ] Reminders work reliably
- [ ] Persistent memory works
- [ ] Semantic memory retrieval works
- [x] Documents work
- [x] Image understanding works
- [x] Audio transcription works

---

## Milestone C — Connected Assistant

- [x] Phase 6 complete
- [x] Contacts work
- [x] Google Calendar connection works
- [x] Calendar actions work from chat

---

## Milestone D — WhatsApp Assistant

- [ ] Phase 7 complete
- [ ] Account linking works
- [ ] Core features work through WhatsApp
- [ ] WhatsApp media handling works
- [ ] WhatsApp reminder delivery works

---

## Milestone E — Private Alpha

- [ ] Phase 8 complete
- [ ] Critical Phase 9 security tasks complete
- [ ] Critical Phase 9 observability tasks complete
- [ ] Privacy and deletion flows verified
- [ ] Proactive messaging verified

---

## Milestone F — Closed Beta

- [ ] Phase 9 complete
- [ ] AI regression suite passes target thresholds
- [ ] Security review complete
- [ ] Restore test complete
- [ ] Cost monitoring active
- [ ] Feedback collection active

---

# Deferred Beyond MVP

- [ ] Telegram integration
- [ ] Outlook Calendar integration
- [ ] Zoom integration
- [ ] Team workspaces
- [ ] Shared memories
- [ ] Task delegation
- [ ] Custom AI personas
- [ ] Advanced user-defined automations
- [ ] Full CRM capabilities
- [ ] Device contact synchronization
- [ ] Dedicated vector database
- [ ] Microservice decomposition
- [ ] Advanced analytics
- [ ] Autonomous third-party messaging
