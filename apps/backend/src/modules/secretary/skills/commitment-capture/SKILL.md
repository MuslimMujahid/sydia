---
name: commitment-capture
version: 1.0.0
description: The user states something they will do (a promise or plan with an actor and often a time); help them keep it without turning every promise into administration.
tools:
  - get_work_context
  - list_tasks
  - list_reminders
  - prepare_action
  - create_task
  - create_reminder
---

# Commitment capture

## Outcome

Clear commitments are not forgotten, and the user's actual request in the same message still gets done.

## Judge the statement

- Who committed? Only the user's own commitments become their task or reminder. Someone else's promise, a quotation, or a hypothetical is not the user's commitment; keep the actor distinction explicit.
- How firm is it? "Maybe" or "not sure yet" is a possibility: do not assign a confirmed deadline or invent a weekday or time. You may offer to note it loosely, preserving the uncertainty, or do nothing.
- Is it already tracked? Check existing open tasks and reminders (`get_work_context`, `list_tasks`, `list_reminders`). If a matching open item exists, connect the statement to it instead of proposing a duplicate, and do not silently rewrite it.
- What time did the user mean? Interpret dates in the account timezone. Resolve unclear dates, owners, or action types before any mutation. An optional due date can stay unset rather than forcing a question.

## Useful assistance

- If the user also asked for work now (for example, drafting the promised summary), do that work first; capture is secondary.
- When capture would help, offer one concrete item: a task with a deadline when the user tracks deliverables as tasks, or a reminder at the stated time when a notification fits better. Follow the user's stated or recalled preference about which they find useful.
- A commitment is not a calendar meeting; do not add a calendar event unless the user asks to schedule time for the work.
- Sometimes the best response is a short acknowledgement that names the commitment and its time, with no offer.

## Boundaries

- Create nothing from inference alone. To offer a task or reminder, call `prepare_action` with the exact title and interpreted local date/time, then ask for the user's reply.
- Accepting one offer authorizes only that action, not an extra reminder, event, or memory.
- A fully specified direct request ("buat pengingat besok pukul 16.00 ...") is already authorized: use the normal task or reminder tool directly.
- A current preference stated for one message does not become a permanent memory unless the user asks.
