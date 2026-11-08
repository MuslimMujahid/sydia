import { describe, expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { IConversationRepository } from '../../../database/interfaces';
import type { Message } from '../../../database/entities';
import {
  DecisionSettings,
  type DecisionGateway,
  type DecisionResult,
} from '../../../infra/decision-gateway';
import { ApiException } from '../../../shared/errors';
import type { RecordNotesService } from '../../record-notes';
import {
  RecordCellReviewService,
  type RecordCellReviewInput,
} from './record-cell-review.service';
import type { AssistantTool } from './tool-executor.service';

const ORDER_TABLE = {
  title: 'Catatan Pemesanan',
  description: 'Pesanan masuk dari pelanggan.',
  columns: [
    { id: 'tanggal', name: 'Tanggal', type: 'date' },
    { id: 'pemesan', name: 'Pemesan', type: 'text' },
    { id: 'jumlah', name: 'Jumlah', type: 'number' },
    { id: 'pembayaran', name: 'Pembayaran', type: 'text' },
  ],
};

function message(
  id: string,
  role: 'user' | 'assistant',
  content: string,
  extra: Partial<Message> = {},
): Message {
  return {
    id,
    conversationId: 'c1',
    role,
    content,
    createdAt: new Date(0),
    ...extra,
  };
}

const CONVERSATION = [
  message('m1', 'user', 'Bu Rina pesan 2 botol, bayar transfer'),
  message(
    'm2',
    'assistant',
    'Pembayaran belum ditentukan untuk pesanan berikutnya.',
  ),
  message('m3', 'user', 'Pak Dedi pesan 4 botol, ambil sendiri'),
  message('m4', 'user', 'Pesanan setelahnya'),
];

/** Scores every cell by the value it names; unknown values score high. */
function setup(
  options: {
    mode?: string;
    scores?: Record<string, number>;
    result?: DecisionResult;
    messages?: Message[];
    shadowPercent?: number;
  } = {},
) {
  const decide = jest
    .fn<DecisionGateway['decide']>()
    .mockImplementation((request) => {
      if (options.result) return Promise.resolve(options.result);
      const state = JSON.parse(request.state) as {
        cells: Record<string, { value: string }>;
      };

      return Promise.resolve({
        status: 'ok',
        model: 'jev-1.13.0',
        answers: Object.fromEntries(
          Object.entries(state.cells).map(([key, { value }]) => [
            key,
            { type: 'noul', noul: options.scores?.[value] ?? 0.95 },
          ]),
        ),
        inputTokens: 100,
        outputTokens: 10,
        latencyMs: 1,
        costUsd: null,
      });
    });

  const conversations = {
    findUserMemoryEvidence: () =>
      Promise.resolve({
        id: 'm3',
        conversationId: 'c1',
        content: '',
        createdAt: new Date(0),
      }),
    findContext: () =>
      Promise.resolve({
        conversation: {
          id: 'c1',
          rollingSummary: null,
          summaryThroughMessageId: null,
        },
        messages: options.messages ?? CONVERSATION,
      }),
  } as unknown as IConversationRepository;

  const service = new RecordCellReviewService(
    { decide },
    new DecisionSettings(
      new ConfigService({
        BACKEND_RECORD_CELL_REVIEW_MODE: options.mode ?? 'enabled',
        BACKEND_DECISION_COHORT: '*',
        BACKEND_DECISION_CALIBRATION_VERSION: 'synthetic-v1',
        BACKEND_DECISION_SHADOW_SAMPLE_PERCENT: options.shadowPercent ?? 100,
      }),
    ),
    conversations,
  );

  return { service, decide };
}

function input(
  values: Record<string, unknown>,
  extra: Partial<RecordCellReviewInput> = {},
): RecordCellReviewInput {
  return {
    userId: 'user',
    sourceMessageId: 'm3',
    table: ORDER_TABLE,
    rows: [{ values }],
    ...extra,
  };
}

describe('record cell review', () => {
  test('refuses a value the owner did not state', async () => {
    const { service } = setup({ scores: { 'Belum disebut': 0.25 } });

    const outcome = await service.review(
      input({ pemesan: 'Pak Dedi', pembayaran: 'Belum disebut' }),
    );

    expect(outcome).toEqual({
      status: 'reject',
      cells: [{ column: 'Pembayaran', value: 'Belum disebut', score: 0.25 }],
    });
  });

  test('allows values that all score at or above the cutoff', async () => {
    const { service } = setup({ scores: { 'Pak Dedi': 0.4 } });

    expect(await service.review(input({ pemesan: 'Pak Dedi' }))).toEqual({
      status: 'allow',
    });
  });

  test('sends only the owner’s messages up to the current one', async () => {
    const { service, decide } = setup();

    await service.review(input({ pemesan: 'Pak Dedi' }));

    const state = JSON.parse(decide.mock.calls[0]![0].state) as {
      userMessages: string[];
    };

    expect(state.userMessages).toEqual([
      'Bu Rina pesan 2 botol, bayar transfer',
      'Pak Dedi pesan 4 botol, ambil sendiri',
    ]);
  });

  test('reviews only non-empty free-text cells, once per column and value', async () => {
    const { service, decide } = setup();

    await service.review({
      ...input({}),
      rows: [
        {
          values: {
            tanggal: '2026-11-08',
            jumlah: '4',
            pemesan: 'Pak Dedi',
            pembayaran: ' ',
          },
        },
        { values: { pemesan: 'Pak Dedi', pembayaran: null } },
      ],
    });

    const state = JSON.parse(decide.mock.calls[0]![0].state) as {
      cells: Record<string, unknown>;
    };

    expect(Object.values(state.cells)).toEqual([
      { column: 'Pemesan', value: 'Pak Dedi' },
    ]);
  });

  test('makes no decision when no cell holds free text', async () => {
    const { service, decide } = setup();

    expect(await service.review(input({ jumlah: '4' }))).toEqual({
      status: 'skip',
      reason: 'no-cells',
    });
    expect(decide).not.toHaveBeenCalled();
  });

  test('is inactive when the feature is off', async () => {
    const { service, decide } = setup({ mode: 'off' });

    expect(
      await service.review(input({ pembayaran: 'Belum disebut' })),
    ).toEqual({ status: 'skip', reason: 'off' });
    expect(decide).not.toHaveBeenCalled();
  });

  test('in shadow mode reports nothing back and lets the write through', async () => {
    const { service, decide } = setup({
      mode: 'shadow',
      scores: { 'Belum disebut': 0.1 },
    });

    expect(
      await service.review(input({ pembayaran: 'Belum disebut' })),
    ).toEqual({ status: 'allow' });
    expect(decide).toHaveBeenCalledTimes(1);
  });

  test('skips background runs, which are not the owner’s own words', async () => {
    const { service, decide } = setup();

    expect(
      await service.review(
        input({ pembayaran: 'Tunai' }, { context: { trigger: 'background' } }),
      ),
    ).toEqual({ status: 'skip', reason: 'background' });
    expect(decide).not.toHaveBeenCalled();
  });

  test('skips when values may come from an attachment rather than the text', async () => {
    const { service, decide } = setup({
      messages: [
        message('m3', 'user', 'Masukkan pesanan dari foto ini', {
          attachments: [
            { fileAsset: { id: 'f1' } },
          ] as unknown as Message['attachments'],
        }),
      ],
    });

    expect(await service.review(input({ pemesan: 'Bu Ani' }))).toEqual({
      status: 'skip',
      reason: 'outside-sources',
    });
    expect(decide).not.toHaveBeenCalled();
  });

  test('skips when the turn selected files or notes as sources', async () => {
    const { service, decide } = setup();

    expect(
      await service.review(
        input(
          { pemesan: 'Bu Ani' },
          { context: { sourceNoteRefs: ['custom:n1'] } },
        ),
      ),
    ).toEqual({ status: 'skip', reason: 'outside-sources' });
    expect(decide).not.toHaveBeenCalled();
  });

  test('reports an unavailable classifier so the write can proceed', async () => {
    const { service } = setup({
      result: { status: 'fallback', reason: 'timeout', latencyMs: 600 },
    });

    expect(
      await service.review(input({ pembayaran: 'Belum disebut' })),
    ).toEqual({ status: 'unavailable', reason: 'timeout' });
  });
});

describe('record cell review around row writes', () => {
  function tools() {
    const execute = jest
      .fn<AssistantTool['execute']>()
      .mockResolvedValue({ saved: true });

    const tool = (name: string): AssistantTool => ({
      definition: {
        name,
        label: name,
        description: name,
        parameters: { type: 'object', properties: {} },
      },
      parseArguments: (value) => value as never,
      execute,
    });

    return {
      execute,
      list: [tool('add_record_rows'), tool('change_record_schema')],
    };
  }

  const records = {
    metadata: () => Promise.resolve(ORDER_TABLE),
  } as unknown as RecordNotesService;

  const call = (values: Record<string, unknown>) => ({
    userId: 'user',
    sourceMessageId: 'm3',
    idempotencyKey: 'k',
    arguments: {
      id: 'n1',
      revision: 2,
      batch: { rows: [{ values }] },
    } as unknown as Parameters<AssistantTool['execute']>[0]['arguments'],
  });

  test('a refused write saves nothing and names the refused values', async () => {
    const { service } = setup({ scores: { 'Belum disebut': 0.2 } });
    const { list, execute } = tools();
    const [add] = service.wrap(list, records);

    const error = await add!
      .execute(call({ pembayaran: 'Belum disebut' }))
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiException);
    expect(JSON.stringify((error as ApiException).getResponse())).toContain(
      'Pembayaran = \\"Belum disebut\\"',
    );
    expect(execute).not.toHaveBeenCalled();
  });

  test('an accepted write runs the original tool', async () => {
    const { service } = setup();
    const { list, execute } = tools();
    const [add] = service.wrap(list, records);

    await expect(add!.execute(call({ pemesan: 'Pak Dedi' }))).resolves.toEqual({
      saved: true,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test('other record tools are not reviewed', () => {
    const { service } = setup();
    const { list } = tools();

    expect(service.wrap(list, records)[1]).toBe(list[1]);
  });
});
