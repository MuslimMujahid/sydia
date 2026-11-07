import 'reflect-metadata';
import { describe, expect, jest, test } from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import type { IAuditEventRepository } from '../../database/interfaces';
import { ACTIVITY_FEATURE, UserActivityInterceptor } from './user-activity';

function setup(tracked = true, userId: string | null = 'user') {
  function handler() {}

  if (tracked) Reflect.defineMetadata(ACTIVITY_FEATURE, 'notes', handler);
  const context = {
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({ session: userId ? { user: { id: userId } } : null }),
    }),
  } as unknown as ExecutionContext;

  const record = jest
    .fn<IAuditEventRepository['record']>()
    .mockResolvedValue(undefined);

  return {
    record,
    context,
    interceptor: new UserActivityInterceptor(new Reflector(), {
      record,
    }),
  };
}

describe('UserActivityInterceptor', () => {
  test('successful annotated writes record the authenticated user and preserve the response', async () => {
    const { record, context, interceptor } = setup();
    expect(
      await lastValueFrom(
        interceptor.intercept(context, { handle: () => of({ id: 'note' }) }),
      ),
    ).toEqual({ id: 'note' });
    expect(record).toHaveBeenCalledWith({
      userId: 'user',
      eventType: 'user.activity',
      metadata: { feature: 'notes' },
    });
  });
  test('failed writes do not create activity', async () => {
    const { record, context, interceptor } = setup();
    await expect(
      lastValueFrom(
        interceptor.intercept(context, {
          handle: () => throwError(() => new Error('write failed')),
        }),
      ),
    ).rejects.toThrow('write failed');
    expect(record).not.toHaveBeenCalled();
  });
  test('unannotated requests create no activity', async () => {
    const { record, context, interceptor } = setup(false);
    await lastValueFrom(
      interceptor.intercept(context, { handle: () => of('read') }),
    );
    expect(record).not.toHaveBeenCalled();
  });
  test('unauthenticated tracked writes fail before mutation', () => {
    const { context, interceptor } = setup(true, null);
    const handle = jest.fn(() => of('write'));
    expect(() => interceptor.intercept(context, { handle })).toThrow(
      'authenticated user',
    );
    expect(handle).not.toHaveBeenCalled();
  });
  test('persistence failure surfaces rather than reporting untracked success', async () => {
    const { record, context, interceptor } = setup();
    record.mockRejectedValue(new Error('audit unavailable'));
    await expect(
      lastValueFrom(
        interceptor.intercept(context, { handle: () => of('written') }),
      ),
    ).rejects.toThrow('audit unavailable');
  });
});
