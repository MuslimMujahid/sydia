import 'reflect-metadata';
import { expect, test } from '@jest/globals';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateCalendarEventDto, UpdateCalendarEventDto } from './calendar.dto';

test.each([10, 15, 30, 60])(
  'allows a %i-minute event reminder',
  async (reminderMinutes) => {
    const errors = await validate(
      plainToInstance(UpdateCalendarEventDto, { reminderMinutes }),
    );

    expect(errors).toEqual([]);
  },
);

test.each([0, 5, 20, 120, 10.5, null, '10'])(
  'rejects the unsupported reminder value %p',
  async (reminderMinutes) => {
    const errors = await validate(
      plainToInstance(UpdateCalendarEventDto, { reminderMinutes }),
    );

    expect(errors).toEqual([
      expect.objectContaining({ property: 'reminderMinutes' }),
    ]);
  },
);

test('event creation allows omitting the reminder so the default can be applied', async () => {
  const errors = await validate(
    plainToInstance(CreateCalendarEventDto, { title: 'Meeting' }),
  );

  expect(errors).toEqual([]);
});
