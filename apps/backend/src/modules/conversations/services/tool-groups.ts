export const TOOL_GROUPS = {
  tasks: ['create_task', 'update_task', 'list_tasks'],
  reminders: ['create_reminder', 'update_reminder', 'list_reminders'],
  memory: ['save_memory', 'update_memory', 'forget_memory', 'search_memories'],
  documents: [
    'list_documents',
    'read_document',
    'save_attached_files',
    'send_file',
    'search_documents',
  ],
  notes: ['write_daily_note', 'read_daily_note', 'search_daily_notes'],
  contacts: [
    'save_contact',
    'resolve_contact',
    'list_contacts',
    'list_contact_groups',
    'create_contact_group',
    'update_contact_group',
    'delete_contact_group',
    'assign_contact_groups',
  ],
  calendar: [
    'list_calendar_events',
    'create_calendar_event',
    'update_calendar_event',
    'cancel_calendar_event',
  ],
  secrets: ['store_secret', 'create_secret_reveal_link'],
  categories: [
    'list_categories',
    'create_category',
    'update_category',
    'delete_category',
  ],
  time: ['get_current_datetime'],
} as const;
export type ToolGroup = keyof typeof TOOL_GROUPS;
export const TOOL_GROUP_DESCRIPTIONS: Record<ToolGroup, string> = {
  tasks: 'Actionable tasks: create, list, update, complete or organize work.',
  reminders:
    'Scheduled notifications and reminders: create, list, reschedule or change.',
  memory:
    'Explicit remember, correct, forget, or search durable personal facts/preferences.',
  documents:
    'Find/read saved files, answer file-dependent questions, save attachments, or send files.',
  notes: 'Write, read or search dated daily notes/journal entries.',
  contacts:
    'People, contact details, contact groups, or resolving a recipient/invitee.',
  calendar: 'Find, create, change or cancel calendar events/meetings.',
  secrets:
    'Store a secret securely or obtain its one-time reveal link; never reveal raw values.',
  categories:
    'Find, create, rename, change or delete organizational categories.',
  time: 'Current date/time or relative dates in the user timezone.',
};

export function toolNamesForGroups(
  groups: readonly ToolGroup[],
): readonly string[] {
  const selected = new Set<ToolGroup>(groups);

  if (selected.has('tasks')) {
    selected.add('categories');
    selected.add('time');
  }

  if (selected.has('reminders')) selected.add('time');

  if (selected.has('calendar')) {
    selected.add('contacts');
    selected.add('time');
  }

  // File sends can require recipient identity; note searches can use relative dates.
  if (selected.has('documents')) selected.add('contacts');
  if (selected.has('notes')) selected.add('time');

  return Object.entries(TOOL_GROUPS).flatMap(([group, names]) =>
    selected.has(group as ToolGroup) ? [...names] : [],
  );
}

export function validateToolGroups(registered: readonly string[]): void {
  const declared = Object.values(TOOL_GROUPS).flat();
  if (
    new Set(declared).size !== declared.length ||
    registered.length !== declared.length ||
    new Set(registered).size !== registered.length ||
    declared.some((name) => !registered.includes(name))
  )
    throw new Error(
      'Tool-group registry must cover each registered tool exactly once',
    );
}
