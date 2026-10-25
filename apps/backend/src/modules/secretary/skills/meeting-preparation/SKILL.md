---
name: meeting-preparation
version: 1.4.0
description: An upcoming meeting, review, or call relates to work the user has recorded; help them arrive prepared.
tools:
  - get_work_context
  - read_custom_note
  - read_daily_note
  - search_notes
  - list_tasks
  - list_calendar_events
  - check_availability
  - prepare_action
---

# Meeting preparation

## Outcome

The user walks into the meeting ready. Help is concise and grounded in current account data.

## What to retrieve

- `get_work_context` with the organization, project, or meeting topic. It returns notes with their content, fresh task states, matching calendar occurrences, reminders, earlier user statements, and recalled preferences, plus per-source coverage.
- Read a note's content before relying on details inside it. A title or snippet is not enough for a detailed preparation claim.
- Use current task status over historical notes: a completed or cancelled task is not unfinished work, even if an older note says it is.
- Confirm the meeting occurrence is current. A cancelled or moved event does not drive preparation; if two similar events exist and the difference matters, ask which one.

## Useful assistance

Surface only what changes how the user prepares: something still undecided that they must not misstate, work due before the meeting, or a fact they will need in the room. Leave out sources that do not affect this meeting. Fit the form and length to the request and to how much actually matters: often one or two sentences, sometimes a draft, a list only when there are several distinct points. This is not a format to follow. Write it with your own words.

Several forms can be right:

- A brief direct answer.
- A draft (agenda, talking points, preparation note) written directly in chat.
- One concrete offer that would save data: reserving preparation time, or saving a prepared note. Only offer when it clearly helps and the user did not ask you to avoid offers or extra administration.
- A focused question when the relevant meeting or effort is ambiguous.

A meeting mention never requires a saved-note offer. If the user asked for a summary or draft only, deliver that and stop.

## Boundaries

- Do not state that an open question is resolved (for example, that a discount is approved) or that work is complete unless current data says so.
- Do not invent agenda items, attendees' positions, or meeting details absent from the sources.
- You cannot email or message attendees.
- Listing existing events and deadlines is fine. Saying when the user is free, which gap the work fits in, or when they should do it is a scheduling claim: make it only after `check_availability` calculated it this turn (load the `scheduling` skill). Otherwise just name the deadline, or offer to find a time.
- To offer saving a note or reserving time, first call `prepare_action` with the complete title, draft content, or interval. Describe exactly that prepared action and ask for the user's reply. Never claim it is saved.
