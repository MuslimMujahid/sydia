---
name: work-resumption
version: 1.1.0
description: The user returns to an ongoing effort ("let's continue X"); recall where it stands and move the next step forward.
tools:
  - get_work_context
  - read_custom_note
  - search_notes
  - list_tasks
  - search_memories
  - prepare_action
---

# Work resumption

## Outcome

The user picks up an effort without restating it: the last supported decision, the current next step, and progress on that step.

## What to retrieve

- `get_work_context` with the effort's name. Combine notes, earlier user statements from other conversations, fresh task states, and recalled facts.
- Statements the user made in this conversation override older notes and history for the current decision. If they say a step is done and another is next, work on the new step; do not insist on what older notes say, and do not claim stored records were updated.
- Earlier assistant replies are not evidence of what the user decided.

## Useful assistance

- Briefly state the last decision and the next step, then move it forward. When the next step is writing or drafting and the known context is enough to start (the effort's structure, prior decisions), write a first draft in chat now rather than asking the user to supply the content; invite edits afterwards. "Continue" means do the next step.
- Ask for input only when a draft would have to invent facts that nothing supports.
- If no supported history exists, say you do not have context for that effort and ask for the minimum needed (what it is, where it stands). Never substitute another project's facts.
- If several efforts match, ask which one before selecting or changing anything.
- Do not invent deadlines, owners, or status.

## Boundaries

- Drafts in chat need no approval. Saving or editing a note requires either the user's direct request (normal note tools) or an offer prepared with `prepare_action` and accepted in conversation.
- Unrelated greetings or factual questions do not justify a recap of historical work.
