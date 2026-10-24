import 'reflect-metadata';
import { describe, expect, test } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminUsersQueryDto } from './admin-users.dto';

describe('Admin users query validation', () => {
  test('defaults to a bounded first page', async () => {
    const input = plainToInstance(AdminUsersQueryDto, {});
    expect(await validate(input)).toEqual([]);
    expect(input).toMatchObject({ offset: 0, limit: 25 });
  });
  test('accepts URL pagination and status filters', async () => {
    const input = plainToInstance(AdminUsersQueryDto, {
      offset: '25',
      limit: '25',
      status: 'banned',
      q: 'Ada',
    });

    expect(await validate(input)).toEqual([]);
    expect(input).toMatchObject({
      offset: 25,
      limit: 25,
      status: 'banned',
      q: 'Ada',
    });
  });
  test.each([
    { offset: '-1' },
    { offset: '1.5' },
    { offset: 'Infinity' },
    { limit: '0' },
    { limit: '101' },
    { limit: 'abc' },
    { status: 'unknown' },
  ])('rejects invalid pagination or filters: %j', async (values) => {
    expect(
      await validate(plainToInstance(AdminUsersQueryDto, values)),
    ).not.toHaveLength(0);
  });
});
