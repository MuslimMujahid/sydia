# Sydia — Implementation Roadmap

> Tracking-oriented roadmap for the Sydia MVP.  
> Detailed product and technical specifications are defined in the PRD and System Architecture Document.

---

# Phase 0 — Project Foundation

## Backend

- [ ] BE-0001 Initialize NestJS backend
- [ ] BE-0002 Set up PostgreSQL and Prisma
- [ ] BE-0003 Establish API application structure
- [ ] BE-0004 Set up environment configuration
- [ ] BE-0005 Set up logging baseline
- [ ] BE-0006 Set up CI/CD
- [ ] BE-0007 Set up staging environment

## Frontend

- [ ] FE-0001 Initialize TanStack Start frontend
- [ ] FE-0002 Set up application routing
- [ ] FE-0003 Set up API client layer
- [ ] FE-0004 Create dashboard shell
- [ ] FE-0005 Create shared UI foundation
- [ ] FE-0006 Set up loading, error, and empty states
- [ ] FE-0007 Set up frontend CI/CD

## Phase Exit

- [ ] API deploys successfully
- [ ] Frontend deploys successfully
- [ ] PostgreSQL is connected
- [ ] Staging environment is usable

---

# Phase 1 — Account, Authentication, and Identity

## Backend

- [ ] BE-0101 Create User domain
- [ ] BE-0102 Implement authentication
- [ ] BE-0103 Implement user sessions
- [ ] BE-0104 Create External Identity domain
- [ ] BE-0105 Implement user preferences
- [ ] BE-0106 Implement timezone and locale settings
- [ ] BE-0107 Add account audit events
- [ ] BE-0108 Add authorization guards

## Frontend

- [ ] FE-0101 Create sign-up page
- [ ] FE-0102 Create sign-in page
- [ ] FE-0103 Implement sign-out flow
- [ ] FE-0104 Create onboarding flow
- [ ] FE-0105 Create profile settings
- [ ] FE-0106 Create timezone and locale settings
- [ ] FE-0107 Protect authenticated routes
- [ ] FE-0108 Handle expired sessions

## Phase Exit

- [ ] User can register
- [ ] User can sign in and sign out
- [ ] User profile and preferences are persisted
- [ ] Protected routes are enforced

---

# Phase 2 — Conversational Core and WhatsApp

## Backend

- [ ] BE-0201 Create Conversation domain
- [ ] BE-0202 Create Message domain
- [ ] BE-0203 Create Conversation Summary domain
- [ ] BE-0204 Create Assistant Run domain
- [ ] BE-0205 Create Tool Invocation domain
- [ ] BE-0206 Implement Model Gateway
- [ ] BE-0207 Implement Assistant Orchestrator
- [ ] BE-0208 Implement Context Builder
- [ ] BE-0209 Implement conversation summarization
- [ ] BE-0210 Create web chat API
- [ ] BE-0211 Integrate WhatsApp webhook
- [ ] BE-0212 Implement WhatsApp identity linking
- [ ] BE-0213 Implement WhatsApp outbound messaging
- [ ] BE-0214 Implement inbound message idempotency
- [ ] BE-0215 Implement assistant tool execution safeguards

## Frontend

- [ ] FE-0201 Create web chat page
- [ ] FE-0202 Create conversation list
- [ ] FE-0203 Create message history view
- [ ] FE-0204 Create chat composer
- [ ] FE-0205 Add assistant loading state
- [ ] FE-0206 Add assistant error and retry state
- [ ] FE-0207 Create WhatsApp connection page
- [ ] FE-0208 Create WhatsApp account-linking flow
- [ ] FE-0209 Show WhatsApp connection status
- [ ] FE-0210 Create assistant activity/history view

## Phase Exit

- [ ] User can chat with Sydia from the web
- [ ] User can link WhatsApp
- [ ] User can chat with Sydia from WhatsApp
- [ ] Web and WhatsApp use the same assistant runtime
- [ ] Conversation summaries are generated when needed

---

# Phase 3 — Reminders and Tasks

## Backend

- [ ] BE-0301 Set up Redis
- [ ] BE-0302 Set up BullMQ
- [ ] BE-0303 Establish worker process
- [ ] BE-0304 Create Reminder domain
- [ ] BE-0305 Create Reminder Schedule domain
- [ ] BE-0306 Create Reminder Occurrence domain
- [ ] BE-0307 Implement reminder scheduling
- [ ] BE-0308 Implement recurring reminders
- [ ] BE-0309 Implement reminder delivery
- [ ] BE-0310 Implement reminder assistant tools
- [ ] BE-0311 Create Task domain
- [ ] BE-0312 Implement task assistant tools
- [ ] BE-0313 Implement task/reminder reference resolution
- [ ] BE-0314 Implement WhatsApp proactive reminder delivery
- [ ] BE-0315 Add reminder and task audit events

## Frontend

- [ ] FE-0301 Create Reminders page
- [ ] FE-0302 Create reminder detail/edit flow
- [ ] FE-0303 Create Tasks page
- [ ] FE-0304 Create task detail/edit flow
- [ ] FE-0305 Add task filters
- [ ] FE-0306 Add reminder filters
- [ ] FE-0307 Create Today page
- [ ] FE-0308 Add task/reminder chat action cards
- [ ] FE-0309 Add snooze and complete actions
- [ ] FE-0310 Add reschedule actions

## Phase Exit

- [ ] User can create reminders via chat
- [ ] User can create recurring reminders
- [ ] User can reschedule, snooze, and cancel reminders
- [ ] User can create, update, and complete tasks
- [ ] Tasks and reminders are manageable from the dashboard

---

# Phase 4 — Memory and Semantic Retrieval

## Backend

- [ ] BE-0401 Enable pgvector
- [ ] BE-0402 Create Memory domain
- [ ] BE-0403 Implement explicit memory tools
- [ ] BE-0404 Implement memory embeddings
- [ ] BE-0405 Implement keyword search
- [ ] BE-0406 Implement semantic search
- [ ] BE-0407 Implement hybrid retrieval
- [ ] BE-0408 Add memory retrieval to assistant context
- [ ] BE-0409 Implement automatic memory extraction
- [ ] BE-0410 Implement memory conflict handling
- [ ] BE-0411 Implement memory supersession
- [ ] BE-0412 Implement memory deletion and index cleanup
- [ ] BE-0413 Add memory provenance

## Frontend

- [ ] FE-0401 Create Memory page
- [ ] FE-0402 Create memory search
- [ ] FE-0403 Create memory detail view
- [ ] FE-0404 Create memory edit flow
- [ ] FE-0405 Add pin memory action
- [ ] FE-0406 Add archive memory action
- [ ] FE-0407 Add delete memory action
- [ ] FE-0408 Show memory provenance
- [ ] FE-0409 Add automatic-memory setting

## Phase Exit

- [ ] User can explicitly save a memory
- [ ] User can retrieve memories semantically
- [ ] User can browse and manage memories
- [ ] Updated memories supersede outdated information correctly
- [ ] Deleted memories no longer appear in retrieval

---

# Phase 5 — Documents, Images, and Voice

## Backend

- [ ] BE-0501 Set up object storage
- [ ] BE-0502 Create File Asset domain
- [ ] BE-0503 Create Document domain
- [ ] BE-0504 Create Document Chunk domain
- [ ] BE-0505 Implement file ingestion
- [ ] BE-0506 Implement document parsing
- [ ] BE-0507 Implement document chunking
- [ ] BE-0508 Implement document embeddings
- [ ] BE-0509 Implement document retrieval
- [ ] BE-0510 Implement document provenance
- [ ] BE-0511 Implement structured document extraction
- [ ] BE-0512 Implement image understanding
- [ ] BE-0513 Implement voice-note transcription
- [ ] BE-0514 Route voice transcripts to assistant
- [ ] BE-0515 Implement document deletion cleanup

## Frontend

- [ ] FE-0501 Create Files page
- [ ] FE-0502 Create file upload flow
- [ ] FE-0503 Show file processing state
- [ ] FE-0504 Create file detail view
- [ ] FE-0505 Add ask-a-file interaction
- [ ] FE-0506 Add document source references
- [ ] FE-0507 Add chat file attachments
- [ ] FE-0508 Add chat image attachments
- [ ] FE-0509 Show voice-note transcripts
- [ ] FE-0510 Add file deletion flow

## Phase Exit

- [ ] User can upload/send a document
- [ ] User can ask questions about documents
- [ ] User can send an image for understanding
- [ ] User can send a voice note
- [ ] Document answers show provenance
- [ ] Deleted files no longer appear in retrieval

---

# Phase 6 — Contacts and Google Calendar

## Backend

- [ ] BE-0601 Create Contact domain
- [ ] BE-0602 Implement contact assistant tools
- [ ] BE-0603 Implement contact aliases
- [ ] BE-0604 Implement contact resolution
- [ ] BE-0605 Implement Google OAuth
- [ ] BE-0606 Create Calendar integration domain
- [ ] BE-0607 Implement calendar provider adapter
- [ ] BE-0608 Implement calendar read operations
- [ ] BE-0609 Implement calendar create operations
- [ ] BE-0610 Implement calendar update operations
- [ ] BE-0611 Implement calendar cancel operations
- [ ] BE-0612 Implement calendar assistant tools
- [ ] BE-0613 Implement calendar disconnect/revoke flow

## Frontend

- [ ] FE-0601 Create Contacts page
- [ ] FE-0602 Create contact detail/edit flow
- [ ] FE-0603 Add contact search
- [ ] FE-0604 Create Calendar page
- [ ] FE-0605 Create Google Calendar connect flow
- [ ] FE-0606 Show calendar connection status
- [ ] FE-0607 Add calendar disconnect flow
- [ ] FE-0608 Add calendar events to Today page

## Phase Exit

- [ ] User can save and retrieve contacts
- [ ] Sydia can resolve contacts conversationally
- [ ] User can connect Google Calendar
- [ ] User can view calendar events
- [ ] User can create, update, and cancel events through Sydia

---

# Phase 7 — Proactive Assistant, Settings, and Privacy

## Backend

- [ ] BE-0701 Create notification abstraction
- [ ] BE-0702 Implement daily briefing
- [ ] BE-0703 Implement proactive follow-ups
- [ ] BE-0704 Implement WhatsApp proactive message templates
- [ ] BE-0705 Implement notification preferences
- [ ] BE-0706 Implement global proactive pause
- [ ] BE-0707 Implement data export
- [ ] BE-0708 Implement conversation deletion
- [ ] BE-0709 Implement account deletion
- [ ] BE-0710 Implement integration revocation
- [ ] BE-0711 Implement data retention jobs
- [ ] BE-0712 Expand assistant preferences

## Frontend

- [ ] FE-0701 Create Assistant settings
- [ ] FE-0702 Create Notification settings
- [ ] FE-0703 Create Integrations settings
- [ ] FE-0704 Create Memory & Privacy settings
- [ ] FE-0705 Create Data settings
- [ ] FE-0706 Add daily briefing controls
- [ ] FE-0707 Add proactive messaging pause
- [ ] FE-0708 Add data export flow
- [ ] FE-0709 Add conversation deletion flow
- [ ] FE-0710 Add account deletion flow
- [ ] FE-0711 Refine Today/Home page

## Phase Exit

- [ ] User can enable daily briefing
- [ ] User can control proactive messaging
- [ ] User can manage privacy settings
- [ ] User can export or delete account data
- [ ] User can revoke connected integrations

---

# Phase 8 — Entitlements, Reliability, and Beta Hardening

## Backend

- [ ] BE-0801 Implement usage metering
- [ ] BE-0802 Implement entitlement service
- [ ] BE-0803 Add billing integration boundary
- [ ] BE-0804 Implement rate limiting
- [ ] BE-0805 Implement AI usage limits
- [ ] BE-0806 Implement file-processing limits
- [ ] BE-0807 Build AI regression test suite
- [ ] BE-0808 Build integration test suite
- [ ] BE-0809 Run authorization/security tests
- [ ] BE-0810 Run retrieval isolation tests
- [ ] BE-0811 Harden queue failure handling
- [ ] BE-0812 Harden provider failure handling
- [ ] BE-0813 Add operational dashboards
- [ ] BE-0814 Add operational alerts
- [ ] BE-0815 Configure database backups
- [ ] BE-0816 Perform restore test
- [ ] BE-0817 Finalize retention policy
- [ ] BE-0818 Finalize audit coverage

## Frontend

- [ ] FE-0801 Create Usage page
- [ ] FE-0802 Create Subscription page
- [ ] FE-0803 Add quota/limit states
- [ ] FE-0804 Add provider-disconnected states
- [ ] FE-0805 Standardize destructive confirmations
- [ ] FE-0806 Complete accessibility review
- [ ] FE-0807 Complete responsive review
- [ ] FE-0808 Add product telemetry
- [ ] FE-0809 Add assistant response feedback
- [ ] FE-0810 Add failed-action feedback
- [ ] FE-0811 Add support/contact entry
- [ ] FE-0812 Complete closed-beta UI polish

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

## Milestone A — Internal Vertical Slice

- [ ] Phase 0 complete
- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Account creation works
- [ ] Web chat works
- [ ] WhatsApp linking works
- [ ] WhatsApp assistant works

---

## Milestone B — Useful Personal Assistant

- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Tasks work reliably
- [ ] Reminders work reliably
- [ ] Persistent memory works
- [ ] Semantic memory retrieval works

---

## Milestone C — Multimodal Assistant

- [ ] Phase 5 complete
- [ ] Document understanding works
- [ ] Document retrieval works
- [ ] Image understanding works
- [ ] Voice-note transcription works

---

## Milestone D — Connected Assistant

- [ ] Phase 6 complete
- [ ] Contacts work
- [ ] Google Calendar connection works
- [ ] Calendar actions work from chat

---

## Milestone E — Private Alpha

- [ ] Phase 7 complete
- [ ] Critical Phase 8 security tasks complete
- [ ] Critical Phase 8 observability tasks complete
- [ ] Privacy and deletion flows verified
- [ ] Proactive messaging verified

---

## Milestone F — Closed Beta

- [ ] Phase 8 complete
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
