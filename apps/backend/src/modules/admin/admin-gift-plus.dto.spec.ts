import { describe, expect, test } from '@jest/globals';
import { validate } from 'class-validator';
import { AdminGiftPlusDto } from './admin-gift-plus.dto';

describe('Admin gift validation', () => {
  test.each([1, 7, 30, 90, 180, 3650])(
    'accepts %s whole days',
    async (durationDays) => {
      const input = Object.assign(new AdminGiftPlusDto(), {
        durationDays,
        requestId: '00000000-0000-4000-8000-000000000001',
      });

      expect(await validate(input)).toEqual([]);
    },
  );

  test.each([0, -1, 1.5, 3651, '30', undefined, null])(
    'rejects invalid duration %s',
    async (durationDays) => {
      const input = Object.assign(new AdminGiftPlusDto(), {
        durationDays,
        requestId: '00000000-0000-4000-8000-000000000001',
      });

      expect(await validate(input)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: 'durationDays' }),
        ]),
      );
    },
  );

  test('requires a UUID to make retries safe', async () => {
    const input = Object.assign(new AdminGiftPlusDto(), {
      durationDays: 30,
      requestId: 'invalid',
    });

    expect(await validate(input)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'requestId' }),
      ]),
    );
  });
});
