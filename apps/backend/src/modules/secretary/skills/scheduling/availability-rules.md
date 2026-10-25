# Availability rules

- Intervals are `[start, end)`. With zero buffer, an event ending at 15:00 allows one starting at 15:00.
- Confirmed and tentative events block time; cancelled events and cancelled recurrence occurrences do not.
- A recurrence exception replaces its original occurrence.
- An all-day event blocks its local dates; its end date is exclusive (an event on D4 ending D5 does not block D5).
- A task due time is a deadline, not occupied time. A reminder is a notification, not busy time.
- Buffers apply on both sides of existing events.
- Relative dates use the account timezone. Events stored in another timezone keep their actual instant.
- If a local time is skipped or repeated by a daylight-saving transition, ask for clarification before saving.
- Ranking: valid slots matching soft preferences first, then earliest start.
