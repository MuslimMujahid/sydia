import { HttpStatus } from '@nestjs/common';
import { isTimeZone } from 'class-validator';
import { ApiException, ErrorCodes } from '../../../shared/errors';
import type { UpdateUserProfileService } from '../../users/user-profile.module';
import type { AssistantTool } from './tool-executor.service';

function parseTimezone(value: unknown): string {
  const timezone = typeof value === 'string' ? value.trim() : '';

  if ((timezone === 'UTC' || timezone.includes('/')) && isTimeZone(timezone))
    return timezone;

  throw new ApiException({
    code: ErrorCodes.BAD_REQUEST,
    message: 'Choose an IANA timezone such as Asia/Jakarta, or UTC.',
    status: HttpStatus.BAD_REQUEST,
  });
}

export function createTimezoneTool(
  profiles: Pick<UpdateUserProfileService, 'execute'>,
): AssistantTool {
  return {
    definition: {
      name: 'set_timezone',
      label: 'Change profile timezone',
      description:
        'Change the profile timezone only on explicit request. Resolve a clear city to its IANA zone, or ask if unclear. Confirm after success. For subsequent relative dates, call get_current_datetime.',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'An IANA timezone such as Asia/Jakarta, or UTC.',
          },
        },
        required: ['timezone'],
        additionalProperties: false,
      },
    },
    parseArguments(value) {
      const timezone =
        value && typeof value === 'object' && 'timezone' in value
          ? value.timezone
          : undefined;

      return { timezone: parseTimezone(timezone) };
    },
    async execute({ userId, arguments: input }) {
      const { timezone } = input as { timezone: string };
      const user = await profiles.execute(userId, { timezone });

      if (!user)
        throw new ApiException({
          code: ErrorCodes.NOT_FOUND,
          message: 'The user profile could not be found.',
          status: HttpStatus.NOT_FOUND,
        });

      return { timezone: user.timezone };
    },
  };
}
