import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  RECURRENCE_FREQUENCIES,
  REMINDER_REPEAT_INTERVAL,
  type RecurrenceFrequency,
} from '../../database/entities';

export class RecurrenceDto {
  @IsIn(RECURRENCE_FREQUENCIES) frequency!: RecurrenceFrequency;
  @IsInt() @Min(1) @Max(100) interval!: number;
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @IsDateString()
  endsAt?: string | null;
}
export class CreateReminderDto {
  @IsString() @MinLength(1) @MaxLength(240) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string | null;
  @IsDateString() scheduledAt!: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto | null;

  @IsOptional() @IsBoolean() important?: boolean;
  @IsOptional()
  @IsInt()
  @Min(REMINDER_REPEAT_INTERVAL.min)
  @Max(REMINDER_REPEAT_INTERVAL.max)
  repeatIntervalMinutes?: number;
}
export class UpdateReminderDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(240) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string | null;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto | null;

  @IsOptional() @IsBoolean() important?: boolean;
  @IsOptional()
  @IsInt()
  @Min(REMINDER_REPEAT_INTERVAL.min)
  @Max(REMINDER_REPEAT_INTERVAL.max)
  repeatIntervalMinutes?: number;
}
export class SnoozeReminderDto {
  @IsDateString() until!: string;
  @IsOptional() @IsString() occurrenceId?: string;
  @IsOptional() @IsBoolean() confirmPastNextOccurrence?: boolean;
}
export class AcknowledgeReminderDto {
  @IsOptional() @IsString() occurrenceId?: string;
}
export class ReminderFiltersDto {
  @IsOptional() @IsIn(['today', 'upcoming', 'past']) schedule?:
    'today' | 'upcoming' | 'past';

  @IsOptional() @IsString() search?: string;
}
