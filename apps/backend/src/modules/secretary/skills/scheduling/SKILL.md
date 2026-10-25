---
name: scheduling
version: 1.2.0
description: A proposed time, a free-slot question, a conflict, or finding time for work; calculate availability from the Sydia calendar and explain it.
references:
  - availability-rules.md
tools:
  - get_work_context
  - search_memories
  - list_tasks
  - list_calendar_events
  - check_availability
  - prepare_action
  - create_calendar_event
---

# Scheduling

## Outcome

The user learns whether a time works and, when useful, gets a specific valid alternative, without any event being saved unless they accept or directly request it.

## Gather constraints

- Duration: from the current request or verified work context (for example, a note stating the work needs 60 minutes). If it is unknown, ask, or propose an explicit assumption for confirmation. Never borrow a duration from another discussion or silently assume 30/60 minutes.
- Window: the user's explicit window for this request, otherwise their working hours from recalled preferences. Do not infer working hours from an empty calendar. If neither is known, ask.
- Buffer: a required gap from preferences or the current request. A current-request exception (for example, zero gap just this once) applies to this request only.
- Deadline: a related task's current due time is a hard limit. Pass its `taskId` so the tool enforces it.
- Soft preferences (such as mornings for focus work) rank options; they never override a hard constraint.

Use `get_work_context` or `search_memories` to retrieve preferences when they are not already in context.

## Calculate

Always call `check_availability` before claiming a time is free, conflicting, or the best option. It reads current Sydia calendar occurrences (recurrences and exceptions expanded, cancelled events excluded, all-day events with exclusive end dates) and returns conflicts, the requested interval's status, and ranked valid slots. Read `availability-rules.md` with `load_skill` if a rule is unclear.

If the calendar read fails, say you cannot verify availability right now; never treat a failure as an empty calendar.

## Respond

- State whether the requested interval works, naming any conflicting event and its time, including buffer violations.
- Offer one recommended interval and at most two alternatives, each with local date, start–end, and a short reason.
- If nothing fits, name the constraint that blocks it and ask which one to adjust (window, duration, another day before any deadline, splitting). Never shorten, split, move outside working hours, or pass a deadline without agreement; if another day would fall after a task's deadline, say so explicitly. Do not suggest moving or shortening the user's existing events as a way to make room.
- Do not mention Google Calendar, synchronization, or connection status unless the user asks about it.
- Only offer to schedule the work on the calendar when the user is planning to do it and did not say to just check. To offer, call `prepare_action` with `create_calendar_event` and the exact interval before writing any reply text; text written alongside a tool call is not shown to the user. After it returns, write the complete answer (the result and its reasons as above) followed by the question. Never move an existing event to make room.
- Wording: describe this as adding or scheduling an event on the calendar, in natural phrasing for the user's language. In Indonesian say for example "Mau saya jadwalkan di kalender pukul 09.45–10.45?", "Mau saya masukkan ke kalender?", "Sudah saya jadwalkan: …", or "Acara … sudah ditambahkan ke kalender". Do not use "blok waktu", "blokir", or "memblokir"; they read as a literal translation.
