import { describe, expect, jest, test } from '@jest/globals';
import type { ICalendarRepository, IContactRepository, IUserRepository } from '../../../database/interfaces';
import type { CalendarService } from '../../calendar/calendar.service';
import type { DocumentService } from '../../documents/document.service';
import { createPhaseTools } from './phase-tools';

function tools(overrides: Partial<{ contacts: IContactRepository; documents: DocumentService; calendars: ICalendarRepository; calendarService: CalendarService; users: IUserRepository }> = {}) {
  return createPhaseTools({ contacts: {} as IContactRepository, documents: {} as DocumentService, calendars: {} as ICalendarRepository, calendarService: {} as CalendarService, users: { findById: jest.fn<() => Promise<{ timezone: string }>>().mockResolvedValue({ timezone: 'Asia/Jakarta' }) } as unknown as IUserRepository, ...overrides });
}
describe('phase 5 and 6 assistant tools', () => {
  test('saves and resolves a contact through structured repositories', async () => {
    const create = jest.fn<(userId: string, input: unknown) => Promise<{ id: string; name: string }>>().mockResolvedValue({ id: 'contact-1', name: 'Rina' });
    const resolve = jest.fn<(userId: string, reference: string) => Promise<Array<{ id: string; name: string }>>>().mockResolvedValue([{ id: 'contact-1', name: 'Rina' }]);
    const available = tools({ contacts: { create, resolve } as unknown as IContactRepository });
    await available.find((tool) => tool.definition.name === 'save_contact')?.execute({ userId: 'user-1', sourceMessageId: 'message-1', idempotencyKey: 'one', arguments: { name: 'Rina', aliases: ['Bu Rina'] } });
    const found = await available.find((tool) => tool.definition.name === 'resolve_contact')?.execute({ userId: 'user-1', sourceMessageId: 'message-2', idempotencyKey: 'two', arguments: { reference: 'Bu Rina' } });
    expect(create).toHaveBeenCalledWith('user-1', expect.objectContaining({ name: 'Rina', aliases: ['Bu Rina'] }));
    expect(found).toEqual({ contacts: [{ id: 'contact-1', name: 'Rina' }] });
  });
  test('returns document provenance from retrieval', async () => {
    const search = jest.fn<(userId: string, query: string, limit: number) => Promise<Array<{ id: string; documentId: string; title: string; chunkIndex: number; pageNumber: number; content: string }>>>().mockResolvedValue([{ id: 'chunk-1', documentId: 'doc-1', title: 'invoice.pdf', chunkIndex: 2, pageNumber: 3, content: 'Total Rp500.000' }]);
    const result = await tools({ documents: { search } as unknown as DocumentService }).find((tool) => tool.definition.name === 'search_documents')?.execute({ userId: 'user-1', sourceMessageId: 'message-1', idempotencyKey: 'one', arguments: { query: 'total invoice' } });
    expect(result).toEqual({ sources: [{ documentId: 'doc-1', filename: 'invoice.pdf', page: 3, chunk: 2, quote: 'Total Rp500.000' }] });
  });
  test('creates, updates, and cancels calendar events through service', async () => {
    const event = { id: 'event-1', title: 'Review' };
    const create = jest.fn<(userId: string, input: unknown) => Promise<typeof event>>().mockResolvedValue(event);
    const update = jest.fn<(userId: string, id: string, input: unknown) => Promise<typeof event>>().mockResolvedValue(event);
    const cancel = jest.fn<(userId: string, id: string) => Promise<typeof event>>().mockResolvedValue(event);
    const available = tools({ calendarService: { create, update, cancel } as unknown as CalendarService });
    await available.find((tool) => tool.definition.name === 'create_calendar_event')?.execute({ userId: 'user-1', sourceMessageId: 'message-1', idempotencyKey: 'one', arguments: { title: 'Review', startAt: '2026-09-07T02:00:00Z', endAt: '2026-09-07T03:00:00Z' } });
    await available.find((tool) => tool.definition.name === 'update_calendar_event')?.execute({ userId: 'user-1', sourceMessageId: 'message-2', idempotencyKey: 'two', arguments: { id: 'event-1', title: 'Review final' } });
    await available.find((tool) => tool.definition.name === 'cancel_calendar_event')?.execute({ userId: 'user-1', sourceMessageId: 'message-3', idempotencyKey: 'three', arguments: { id: 'event-1' } });
    expect(create).toHaveBeenCalledTimes(1); expect(update).toHaveBeenCalledWith('user-1', 'event-1', expect.objectContaining({ title: 'Review final' })); expect(cancel).toHaveBeenCalledWith('user-1', 'event-1');
  });
});
