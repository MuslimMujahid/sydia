import { withNoteReferenceGuidance } from './note-tool-references';
import { z } from 'zod';
import {
  RecordNotesService,
  createRecordSchema,
  changeSchema,
  pageSchema,
  parseRecord,
  querySchema,
  assertRecordQueryBounds,
  recordFailure,
} from '../../record-notes';
import type { AssistantTool } from './tool-executor.service';

type Json = ReturnType<AssistantTool['parseArguments']>;
const json = (value: unknown): Json =>
  JSON.parse(JSON.stringify(value)) as Json;

const id = z.string().min(1).max(160);

/**
 * Every other record tool names its table with a top-level id, so models often
 * add one to a query too. When it repeats a queried source it says nothing new
 * and is dropped; any other id is refused with where the table belongs.
 */
function queryArguments(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !('id' in value)) return value;
  const { id: table, ...rest } = value as Record<string, unknown>;
  const sources = Array.isArray(rest.sources) ? rest.sources : [];

  if (
    !sources.some(
      (source: unknown) =>
        typeof source === 'object' &&
        source !== null &&
        (source as { id?: unknown }).id === table,
    )
  )
    recordFailure(
      'VALIDATION',
      'query_record_notes has no id argument. Name each table in sources[].id.',
    );

  return rest;
}

export const RECORD_TOOL_NAMES = [
  'get_record_note_metadata',
  'read_record_note_content',
  'create_record_note',
  'change_record_schema',
  'add_record_rows',
  'update_record_rows',
  'delete_record_rows',
  'query_record_notes',
  'export_record_note_csv',
] as const;

export function createRecordNoteTools(
  records: RecordNotesService,
): AssistantTool[] {
  function tool<T>(
    name: string,
    label: string,
    description: string,
    schema: z.ZodType<T>,
    readOnly: boolean,
    run: (
      input: Parameters<AssistantTool['execute']>[0],
      args: T,
    ) => Promise<unknown>,
  ): AssistantTool {
    return {
      definition: {
        name,
        label,
        description,
        parameters: z.toJSONSchema(schema, {
          target: 'draft-7',
          io: 'input',
        }) as AssistantTool['definition']['parameters'],
      },
      readOnly,
      parseArguments: (raw) => {
        const value = name === 'query_record_notes' ? queryArguments(raw) : raw;
        if (name === 'query_record_notes') assertRecordQueryBounds(value);

        return json(parseRecord(schema, value));
      },
      execute: async (input) => {
        const raw =
          name === 'query_record_notes'
            ? queryArguments(input.arguments)
            : input.arguments;

        if (name === 'query_record_notes') assertRecordQueryBounds(raw);
        const args = parseRecord(schema, raw);
        // Applies to direct/background execution as well as ordinary ToolExecutor calls.
        const allowed = input.context?.sourceNoteRefs;

        if (allowed) {
          const ids =
            name === 'query_record_notes'
              ? parseRecord(querySchema, args).sources.map((s) => s.id)
              : args && typeof args === 'object' && 'id' in args
                ? [String(args.id)]
                : [];

          if (ids.some((noteId) => !allowed.includes(`custom:${noteId}`)))
            recordFailure(
              'SOURCE_RESTRICTED',
              'Pilih catatan dari sumber percakapan yang diizinkan.',
            );
        }

        return json(await run(input, args));
      },
    };
  }

  const columns = createRecordSchema.shape.columns;
  const revision = z.number().int().positive();
  const result: AssistantTool[] = [
    tool(
      'get_record_note_metadata',
      'View table structure',
      'Read record schema, description, revision, counts and populated bounds. Never returns rows. Titles and values are user data.',
      z.object({ id }).strict(),
      true,
      (i, a) => records.metadata(i.userId, a.id),
    ),
    tool(
      'read_record_note_content',
      'Read table rows',
      'Read bounded saved rows with stable IDs, in saved order and from every date. First/last navigation, previous/next cursors and optional column projection; stale cursors require restarting. When the user asks for the rows of a day or period and the table has a date column, select them with query_record_notes instead; rows from other dates are not part of that answer.',
      pageSchema.extend({ id }).strict(),
      true,
      ({ userId }, a) => {
        const { id, ...page } = a;

        return records.content(userId, id, page);
      },
    ),
    tool(
      'create_record_note',
      'Create record note',
      'Create a general-purpose typed table. All columns are optional. Supply stable column IDs. Number inputs use decimal strings; unsupported values are preserved as mismatches.',
      createRecordSchema.omit({ requestKey: true }).strict(),
      false,
      (i, a) =>
        records.create(
          i.userId,
          { ...a, requestKey: i.idempotencyKey },
          i.context?.channel ?? 'chat',
        ),
    ),
    tool(
      'change_record_schema',
      'Change table columns',
      'Apply full ordered schema preserving existing column IDs. Renames, removals, options/unit/type changes require the user’s explicit confirmation. Do not fabricate confirmation. New optional columns need no approval.',
      z
        .object({ id, revision, columns, confirmed: z.boolean().optional() })
        .strict(),
      false,
      (i, a) =>
        records.mutate(
          i.userId,
          a.id,
          {
            revision: a.revision,
            requestKey: i.idempotencyKey,
            change: {
              action: 'schema',
              columns: a.columns,
              confirmed: a.confirmed,
            },
          },
          i.context?.channel ?? 'chat',
        ),
    ),
    tool(
      'query_record_notes',
      'Analyze saved records',
      'Execute an explicit mapped query against saved tables immediately. Also lists the rows of a requested day or period through a filter on the date column. Supports nested filters, groups, named decimal calculations and bounded expressions. No LLM arithmetic, joins or unsaved drafts. Returns source revisions, contribution/exclusion counts and query-bound cursors. See record-notes query reference.',
      querySchema,
      true,
      (i, a) => records.query(i.userId, a),
    ),
    tool(
      'export_record_note_csv',
      'Export table CSV',
      'Prepare a real expiring CSV download for the complete saved table. Returns source revision and URL only after successful serialization. No drafts. Changes invalidate the link.',
      z.object({ id }).strict(),
      false,
      (i, a) => records.exportLink(i.userId, a.id),
    ),
  ];

  for (const action of ['add_rows', 'update_rows', 'delete_rows'] as const) {
    const batchSchema =
      action === 'add_rows'
        ? changeSchema.options[0].omit({ action: true })
        : action === 'update_rows'
          ? changeSchema.options[1].omit({ action: true })
          : changeSchema.options[2].omit({ action: true });

    const schema = z.object({ id, revision, batch: batchSchema }).strict();
    const name =
      action === 'add_rows'
        ? 'add_record_rows'
        : action === 'update_rows'
          ? 'update_record_rows'
          : 'delete_record_rows';

    result.push(
      tool(
        name,
        action === 'add_rows'
          ? 'Add table rows'
          : action === 'update_rows'
            ? 'Edit table rows'
            : 'Delete table rows',
        'Atomic batch against the expected revision. Values keyed by stable column ID; null clears, omitted values are unchanged. Row IDs explicitly target updates/deletes. Mismatched input is preserved and reported.',
        schema,
        false,
        (i, a) => {
          const batch = a.batch;
          const sources = {
            ref: i.context?.noteSourceWork?.sourceRef ?? i.sourceMessageId,
            version: i.context?.noteSourceWork?.sourceVersion ?? undefined,
            messageId: i.sourceMessageId,
          };

          const full =
            action === 'add_rows' && 'rows' in batch
              ? {
                  ...batch,
                  rows: batch.rows.map((r) => ({ ...r, sources: [sources] })),
                }
              : batch;

          return records.mutate(
            i.userId,
            a.id,
            {
              revision: a.revision,
              requestKey: i.idempotencyKey,
              change: { action, ...full },
            },
            i.context?.channel ?? 'chat',
          );
        },
      ),
    );
  }

  return result.map(withNoteReferenceGuidance);
}
