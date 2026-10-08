import { describe, expect, jest, test } from '@jest/globals';
import type { Reminder } from '../../../database/entities';
import type { IReminderRepository } from '../../../database/interfaces';
import { createDomainTools } from './domain-tools';
import { toolNamesForGroups } from './tool-groups';

const reminder = {
  id: 'reminder-1',
  title: 'Chat teman',
  notes: null,
  scheduledAt: new Date('2026-09-12T12:00:00.000Z'),
  timezone: 'Asia/Jakarta',
  recurrence: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  source: { type: 'dashboard', label: null, messageId: null },
} satisfies Reminder;

function setup() {
  const findById = jest
    .fn<IReminderRepository['findById']>()
    .mockResolvedValue(reminder);

  const list = jest
    .fn<IReminderRepository['list']>()
    .mockResolvedValue([reminder]);

  const remove = jest
    .fn<IReminderRepository['delete']>()
    .mockResolvedValue(true);

  const cancel = jest
    .fn<(id: string) => Promise<void>>()
    .mockResolvedValue(undefined);

  const update = jest
    .fn<IReminderRepository['update']>()
    .mockResolvedValue(null);

  const tools = createDomainTools({
    reminders: {
      findById,
      list,
      delete: remove,
      findReference: findById,
      update,
    } as unknown as IReminderRepository,
    scheduler: { cancel } as unknown as Parameters<
      typeof createDomainTools
    >[0]['scheduler'],
    tasks: {} as Parameters<typeof createDomainTools>[0]['tasks'],
    categories: {} as Parameters<typeof createDomainTools>[0]['categories'],
    users: {
      findById: jest.fn<() => Promise<null>>().mockResolvedValue(null),
    } as unknown as Parameters<typeof createDomainTools>[0]['users'],
    memoryService: {} as Parameters<
      typeof createDomainTools
    >[0]['memoryService'],
  });

  function execute(
    name: string,
    args: { id?: string; query?: string; title?: string },
  ) {
    const tool = tools.find((candidate) => candidate.definition.name === name);
    if (!tool) throw new Error(`Missing tool: ${name}`);

    return tool.execute({
      userId: 'user-1',
      sourceMessageId: 'message-1',
      idempotencyKey: 'delete-1',
      arguments: args,
    });
  }

  return { execute, remove, cancel, list, findById, update, tools };
}

describe('reminder deletion', () => {
  test('hard deletes the owned reminder and cancels its queued notifications before confirming', async () => {
    const { execute, remove, cancel } = setup();
    await expect(
      execute('delete_reminder', { id: 'reminder-1' }),
    ).resolves.toEqual({
      deleted: true,
      reminderId: 'reminder-1',
      title: 'Chat teman',
    });
    expect(remove).toHaveBeenCalledWith('user-1', 'reminder-1');
    expect(cancel).toHaveBeenCalledWith('reminder-1');
  });
  test('includes deletion in the tools available for reminder requests', () => {
    expect(toolNamesForGroups(['reminders'])).toContain('delete_reminder');
  });
  test('rejects ambiguous title matches without deleting either reminder', async () => {
    const { execute, list, remove } = setup();
    list.mockResolvedValue([reminder, { ...reminder, id: 'reminder-2' }]);
    await expect(execute('delete_reminder', { query: 'Chat' })).rejects.toThrow(
      'Several reminders match',
    );
    expect(remove).not.toHaveBeenCalled();
  });
  test('does not confirm deletion when persistence reports no deleted row', async () => {
    const { execute, remove, cancel } = setup();
    remove.mockResolvedValue(false);
    await expect(
      execute('delete_reminder', { id: 'reminder-1' }),
    ).rejects.toThrow('not found');
    expect(cancel).not.toHaveBeenCalled();
  });
  test('does not confirm deletion when queue cleanup fails', async () => {
    const { execute, cancel } = setup();
    cancel.mockRejectedValue(new Error('Queue unavailable'));
    await expect(
      execute('delete_reminder', { id: 'reminder-1' }),
    ).rejects.toThrow('Queue unavailable');
  });
  test('requires a reference instead of deleting an arbitrary reminder', async () => {
    const { execute, remove, list } = setup();
    await expect(execute('delete_reminder', {})).rejects.toThrow('id or query');
    expect(remove).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });
  test('does not report a vanished reminder update as successful', async () => {
    const { execute } = setup();
    await expect(
      execute('update_reminder', {
        id: 'reminder-1',
        title: 'Updated reminder',
      }),
    ).rejects.toThrow('not found');
  });
  test('rejects an update containing only a reference instead of claiming a change', async () => {
    const { execute, update } = setup();
    await expect(
      execute('update_reminder', { id: 'reminder-1' }),
    ).rejects.toThrow('must include a change');
    expect(update).not.toHaveBeenCalled();
  });
  test('does not delete a reminder that does not belong to the current user', async () => {
    const { execute, findById, remove } = setup();
    findById.mockResolvedValue(null);
    await expect(
      execute('delete_reminder', { id: 'someone-elses-reminder' }),
    ).rejects.toThrow('not found');
    expect(findById).toHaveBeenCalledWith('user-1', 'someone-elses-reminder');
    expect(remove).not.toHaveBeenCalled();
  });
  test('deletes a reminder by title without a status filter', async () => {
    const { execute, list } = setup();
    await expect(
      execute('delete_reminder', { query: 'Chat teman' }),
    ).resolves.toEqual({
      deleted: true,
      reminderId: 'reminder-1',
      title: 'Chat teman',
    });
    expect(list).toHaveBeenCalledWith('user-1', { search: 'Chat teman' });
  });
  test('reminder tool definitions do not offer a status parameter', () => {
    const { tools } = setup();
    const update = tools.find(
      (tool) => tool.definition.name === 'update_reminder',
    );

    const list = tools.find(
      (tool) => tool.definition.name === 'list_reminders',
    );

    expect(update?.definition.parameters.properties).not.toHaveProperty(
      'status',
    );
    expect(list?.definition.parameters.properties).not.toHaveProperty('status');
  });
  test('listed reminders do not expose a lifecycle status', async () => {
    const { execute } = setup();
    const result = await execute('list_reminders', {});
    expect(result).toEqual({
      reminders: [
        {
          id: 'reminder-1',
          title: 'Chat teman',
          notes: null,
          date: '2026-09-12',
          time: '19:00',
          weekday: 6,
          recurrence: null,
        },
      ],
    });
  });
});
