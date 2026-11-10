import { describe, expect, jest, test } from '@jest/globals';
import type { IConversationRepository } from '../../../database/interfaces';
import type { Prisma } from '../../../generated/prisma/client';
import { ToolExecutorService } from './tool-executor.service';
import { REPEATED_FAILURE_LIMIT } from './tool-loop-guard';

type Outcome = Error | Prisma.InputJsonValue;

/**
 * An executor whose one tool, `save_row`, answers each call with the next
 * scripted outcome. Every call is persisted through a fake repository so the
 * test can see what was recorded.
 */
function setup(outcomes: Outcome[], parse?: (value: unknown) => unknown) {
  let next = 0;
  const execute = jest.fn(() => {
    const outcome = outcomes[next++] ?? outcomes.at(-1)!;

    return outcome instanceof Error
      ? Promise.reject(outcome)
      : Promise.resolve(outcome);
  });

  const updates: Array<{ status?: string; errorMessage?: string }> = [];
  const repository = {
    createToolInvocation: jest.fn((input: { toolCallId: string }) =>
      Promise.resolve({
        id: `invocation-${input.toolCallId}`,
        status: 'pending',
      }),
    ),
    claimToolInvocation: jest.fn(() => Promise.resolve(true)),
    updateToolInvocation: jest.fn(
      (id: string, update: { status?: string; errorMessage?: string }) => {
        updates.push(update);

        return Promise.resolve({ id, ...update });
      },
    ),
  } as unknown as IConversationRepository;

  const executor = new ToolExecutorService(repository, [
    {
      definition: {
        name: 'save_row',
        label: 'Save row',
        description: 'Save a row.',
        parameters: { type: 'object' },
      },
      parseArguments: (value) => (parse ? parse(value) : value) as never,
      execute,
    },
  ]);

  let calls = 0;

  /** One model turn: calls made through it share the turn's loop record. */
  const turn = () => {
    const tool = executor.aiTools('user-1', 'run-1', 'message-1').save_row;
    if (!tool?.execute) throw new Error('save_row is not executable.');
    const run = tool.execute;

    return (args: Record<string, unknown>) =>
      run(args, {
        toolCallId: `call-${++calls}`,
        messages: [],
        abortSignal: undefined,
      } as never) as Promise<string>;
  };

  return { turn, execute, updates };
}

const missingColumn = () => new Error('Unknown column: catatan.');

describe('repeated identical tool failures', () => {
  test('a call that failed the same way three times is refused unrun and the model is told why', async () => {
    const { turn, execute, updates } = setup([missingColumn()]);
    const call = turn();

    for (let attempt = 0; attempt < REPEATED_FAILURE_LIMIT; attempt += 1)
      await call({ id: 'n-pesanan', catatan: 'Ambil sendiri' });

    const refused = JSON.parse(
      await call({ id: 'n-pesanan', catatan: 'Ambil sendiri' }),
    ) as Record<string, unknown>;

    expect(execute).toHaveBeenCalledTimes(REPEATED_FAILURE_LIMIT);
    expect(refused).toEqual({
      error: 'repeated_failure',
      message: expect.stringContaining('already failed 3 times'),
      lastError: { error: 'tool_failed', message: 'Unknown column: catatan.' },
    });
    expect(updates.at(-1)).toEqual(
      expect.objectContaining({
        status: 'rejected',
        errorMessage: 'Refused after repeated identical failures.',
      }),
    );
  });

  test('the same tool with different arguments still runs after a refusal', async () => {
    const { turn, execute } = setup([
      missingColumn(),
      missingColumn(),
      missingColumn(),
      { saved: true },
    ]);

    const call = turn();

    for (let attempt = 0; attempt <= REPEATED_FAILURE_LIMIT; attempt += 1)
      await call({ id: 'n-pesanan', catatan: 'Ambil sendiri' });

    await expect(
      call({ id: 'n-pesanan', alamat: 'Ambil sendiri' }),
    ).resolves.toBe('{"saved":true}');
    expect(execute).toHaveBeenCalledTimes(REPEATED_FAILURE_LIMIT + 1);
  });

  test('a success of the same call starts the count again', async () => {
    const { turn, execute } = setup([
      missingColumn(),
      missingColumn(),
      { saved: true },
      missingColumn(),
      missingColumn(),
      missingColumn(),
    ]);

    const call = turn();

    for (let attempt = 0; attempt < 6; attempt += 1)
      await call({ id: 'n-pesanan' });

    expect(execute).toHaveBeenCalledTimes(6);
  });

  test('a call whose error changes is not treated as a loop', async () => {
    const { turn, execute } = setup([
      new Error('Revision conflict: 2.'),
      new Error('Revision conflict: 2.'),
      new Error('Revision conflict: 3.'),
      new Error('Revision conflict: 3.'),
    ]);

    const call = turn();

    for (let attempt = 0; attempt < 4; attempt += 1)
      await call({ id: 'n-pesanan' });

    expect(execute).toHaveBeenCalledTimes(4);
  });

  test('argument key order does not hide a repeated call', async () => {
    const { turn, execute } = setup([missingColumn()]);
    const call = turn();

    await call({ id: 'n-pesanan', rows: [{ a: 1, b: 2 }] });
    await call({ rows: [{ b: 2, a: 1 }], id: 'n-pesanan' });
    await call({ id: 'n-pesanan', rows: [{ a: 1, b: 2 }] });
    await call({ rows: [{ a: 1, b: 2 }], id: 'n-pesanan' });

    expect(execute).toHaveBeenCalledTimes(REPEATED_FAILURE_LIMIT);
  });

  test('arguments the tool rejects as invalid count as the same failure', async () => {
    const { turn, execute, updates } = setup([{ saved: true }], () => {
      throw new Error('rows must be an array.');
    });

    const call = turn();

    for (let attempt = 0; attempt < REPEATED_FAILURE_LIMIT; attempt += 1)
      await expect(call({ rows: 'Pak Dedi' })).resolves.toBe(
        'Tool rejected: invalid arguments.',
      );

    const refused = JSON.parse(await call({ rows: 'Pak Dedi' })) as {
      error: string;
      lastError: unknown;
    };

    expect(refused.error).toBe('repeated_failure');
    expect(refused.lastError).toBe('Tool rejected: invalid arguments.');
    expect(execute).not.toHaveBeenCalled();
    expect(updates.at(-1)?.errorMessage).toBe(
      'Refused after repeated identical failures.',
    );
  });

  test('a new turn starts without the previous turn’s failures', async () => {
    const { turn, execute } = setup([missingColumn()]);
    const first = turn();

    for (let attempt = 0; attempt < REPEATED_FAILURE_LIMIT; attempt += 1)
      await first({ id: 'n-pesanan' });

    await turn()({ id: 'n-pesanan' });

    expect(execute).toHaveBeenCalledTimes(REPEATED_FAILURE_LIMIT + 1);
  });
});
