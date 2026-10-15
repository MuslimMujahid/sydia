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
