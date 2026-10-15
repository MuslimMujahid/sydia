import { describe, expect, test } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TaskFiltersDto, UpdateTaskDto } from './task.dto';

describe('task status validation', () => {
  test('rejects doing when updating a task', async () => {
    const errors = await validate(
      plainToInstance(UpdateTaskDto, { status: 'doing' }),
    );

    expect(errors).toEqual([
      expect.objectContaining({
        property: 'status',
        constraints: expect.objectContaining({ isIn: expect.any(String) }),
      }),
    ]);
  });

  test('rejects doing as a task filter', async () => {
    const errors = await validate(
      plainToInstance(TaskFiltersDto, { status: 'doing' }),
    );

    expect(errors).toEqual([
      expect.objectContaining({
        property: 'status',
        constraints: expect.objectContaining({ isIn: expect.any(String) }),
      }),
    ]);
  });

  test.each(['inbox', 'done', 'cancelled'])(
    'accepts %s when updating a task',
    async (status) => {
      expect(
        await validate(plainToInstance(UpdateTaskDto, { status })),
      ).toEqual([]);
    },
  );
});
