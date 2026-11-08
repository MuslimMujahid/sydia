import { describe, expect, jest, test } from '@jest/globals';
import { ApiException } from '../../../shared/errors';
import type { RecordNotesService } from '../../record-notes';
import { createRecordNoteTools } from './record-note-tools';
import type { AssistantTool } from './tool-executor.service';

function queryTool() {
  const query = jest
    .fn<RecordNotesService['query']>()
    .mockResolvedValue({ results: [] } as never);

  const tools = createRecordNoteTools({
    query,
  } as unknown as RecordNotesService);

  const tool = tools.find(
    ({ definition }) => definition.name === 'query_record_notes',
  )!;

  return { tool, query };
}

const QUERY = {
  sources: [{ id: 'n-orders', fields: { day: 'tanggal' } }],
  filter: { field: 'day', op: 'eq', value: '2026-11-08' },
};

const run = (tool: AssistantTool, value: unknown) =>
  tool.execute({
    userId: 'user',
    sourceMessageId: 'm1',
    idempotencyKey: 'k',
    arguments: tool.parseArguments(value),
  });

describe('query_record_notes arguments', () => {
  test('drops a top-level id that repeats a queried table', async () => {
    const { tool, query } = queryTool();

    await run(tool, { id: 'n-orders', ...QUERY });

    expect(query).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({ sources: QUERY.sources }),
    );
    expect(query.mock.calls[0]![1]).not.toHaveProperty('id');
  });

  test('refuses an id naming a table it does not query, and says where tables go', () => {
    const { tool, query } = queryTool();

    let error: unknown;

    try {
      tool.parseArguments({ id: 'n-other', ...QUERY });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ApiException);
    expect(JSON.stringify((error as ApiException).getResponse())).toContain(
      'sources[].id',
    );
    expect(query).not.toHaveBeenCalled();
  });
});
