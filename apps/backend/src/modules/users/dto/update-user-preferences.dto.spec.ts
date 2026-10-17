import { expect, test } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserPreferencesDto } from './update-user-preferences.dto';

test.each([30, 60, 120, 180])(
  'accepts the %i-minute follow-up interval',
  async (followUpIntervalMinutes) => {
    expect(
      await validate(
        plainToInstance(UpdateUserPreferencesDto, { followUpIntervalMinutes }),
      ),
    ).toEqual([]);
  },
);

test.each([0, -30, 45, 60.5, '60'])(
  'rejects unsupported follow-up interval %s',
  async (followUpIntervalMinutes) => {
    expect(
      await validate(
        plainToInstance(UpdateUserPreferencesDto, { followUpIntervalMinutes }),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'followUpIntervalMinutes' }),
      ]),
    );
  },
);

test.each([1, 2, 3, 4, 5, 6, 7])(
  'accepts ISO weekday %i for the weekly brief',
  async (weeklyBriefingDay) => {
    expect(
      await validate(
        plainToInstance(UpdateUserPreferencesDto, { weeklyBriefingDay }),
      ),
    ).toEqual([]);
  },
);

test.each([0, 8, -1, 1.5, '1'])(
  'rejects invalid weekly weekday %s',
  async (weeklyBriefingDay) => {
    expect(
      await validate(
        plainToInstance(UpdateUserPreferencesDto, { weeklyBriefingDay }),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'weeklyBriefingDay' }),
      ]),
    );
  },
);

test('rejects a non-boolean weekly switch', async () => {
  expect(
    await validate(
      plainToInstance(UpdateUserPreferencesDto, {
        weeklyBriefingEnabled: 'true',
      }),
    ),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ property: 'weeklyBriefingEnabled' }),
    ]),
  );
});
