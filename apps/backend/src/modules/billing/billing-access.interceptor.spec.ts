import { expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext, Type } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { billingRepositoryFixture } from '../../../test/support/billing-fixtures';
import { DailyNotesController } from '../daily-notes/daily-notes.controller';
import { NotePresenceController } from '../notes/note-presence.controller';
import { NotesController } from '../notes/notes.controller';
import { RecordNotesController } from '../record-notes/record-notes.controller';
import { BillingAccessService } from './billing-access.service';
import {
  AllowInactiveBilling,
  BillingAccessInterceptor,
} from './billing-access.interceptor';

type BillingRoute = {
  controller: Type<unknown>;
  handler: (...args: never[]) => unknown;
};

function runtime(method: string, allowed = false, route?: BillingRoute) {
  const repository = billingRepositoryFixture({
    ensureAccount: () =>
      Promise.resolve({
        userId: 'owner',
        trialStartsAt: new Date(0),
        trialEndsAt: new Date(1),
        paidUntil: null,
        lastActivatedAt: null,
      }),
  });

  const access = new BillingAccessService(
    repository,
    new ConfigService({
      BACKEND_BILLING_ENFORCEMENT_ENABLED: true,
      BACKEND_BILLING_ROLLOUT_AT: '2026-10-22T00:00:00Z',
      FRONTEND_URL: 'http://localhost:3000',
    }),
  );

  class Controller {}
  if (allowed) AllowInactiveBilling()(Controller);
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        user: { id: 'owner', locale: 'en', role: 'user' },
      }),
    }),
    getClass: () => route?.controller ?? Controller,
    getHandler: () => route?.handler ?? Controller,
  } as unknown as ExecutionContext;

  const next = { handle: jest.fn(() => of('allowed')) };

  return {
    interceptor: new BillingAccessInterceptor(access, new Reflector()),
    context,
    next,
  };
}

test('expired accounts cannot mutate product data', async () => {
  const { interceptor, context, next } = runtime('POST');
  await expect(interceptor.intercept(context, next)).rejects.toMatchObject({
    code: 'BILLING_REQUIRED',
  });
  expect(next.handle).not.toHaveBeenCalled();
});
test.each(['GET', 'DELETE'])(
  'expired accounts retain %s access',
  async (method) => {
    const { interceptor, context, next } = runtime(method);
    await interceptor.intercept(context, next);
    expect(next.handle).toHaveBeenCalledTimes(1);
  },
);
test('account management, billing and POST-based deletion remain accessible', async () => {
  const { interceptor, context, next } = runtime('POST', true);
  await interceptor.intercept(context, next);
  expect(next.handle).toHaveBeenCalledTimes(1);
});

test.each(['acquire', 'release'] as const)(
  'expired accounts can %s editor presence for workspace and chat note readers',
  async (operation) => {
    const { interceptor, context, next } = runtime('POST', false, {
      controller: NotePresenceController,
      handler: NotePresenceController.prototype[operation],
    });

    const response = await interceptor.intercept(context, next);

    await expect(firstValueFrom(response)).resolves.toBe('allowed');
  },
);

// Pin retained reads/downloads alongside presence so opening the editor never
// requires exempting note mutations from billing enforcement.
test.each([
  ['workspace note', 'GET', NotesController, NotesController.prototype.find],
  [
    'daily note',
    'GET',
    DailyNotesController,
    DailyNotesController.prototype.get,
  ],
  [
    'table metadata',
    'GET',
    RecordNotesController,
    RecordNotesController.prototype.metadata,
  ],
  [
    'table content',
    'POST',
    RecordNotesController,
    RecordNotesController.prototype.content,
  ],
  [
    'table query',
    'POST',
    RecordNotesController,
    RecordNotesController.prototype.query,
  ],
  [
    'table export',
    'POST',
    RecordNotesController,
    RecordNotesController.prototype.export,
  ],
] satisfies Array<
  [string, string, BillingRoute['controller'], BillingRoute['handler']]
>)(
  'expired accounts retain access to %s',
  async (_name, method, controller, handler) => {
    const { interceptor, context, next } = runtime(method, false, {
      controller,
      handler,
    });

    const response = await interceptor.intercept(context, next);

    await expect(firstValueFrom(response)).resolves.toBe('allowed');
  },
);

test.each([
  ['create a note', 'POST', NotesController, NotesController.prototype.create],
  ['edit a note', 'PATCH', NotesController, NotesController.prototype.update],
  [
    'save a daily note',
    'PUT',
    DailyNotesController,
    DailyNotesController.prototype.save,
  ],
  [
    'create a table',
    'POST',
    RecordNotesController,
    RecordNotesController.prototype.create,
  ],
  [
    'edit a table',
    'POST',
    RecordNotesController,
    RecordNotesController.prototype.mutate,
  ],
] satisfies Array<
  [string, string, BillingRoute['controller'], BillingRoute['handler']]
>)(
  'expired accounts cannot %s after editor presence is allowed',
  async (_name, method, controller, handler) => {
    const { interceptor, context, next } = runtime(method, false, {
      controller,
      handler,
    });

    await expect(interceptor.intercept(context, next)).rejects.toMatchObject({
      code: 'BILLING_REQUIRED',
    });
    expect(next.handle).not.toHaveBeenCalled();
  },
);
