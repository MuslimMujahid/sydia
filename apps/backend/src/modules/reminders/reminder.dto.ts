import { Type } from 'class-transformer';
import {
  IsArray,
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
  REMINDER_STATUSES,
  type RecurrenceFrequency,
  type ReminderStatus,
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
}
export class UpdateReminderDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(240) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string | null;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto | null;

  @IsOptional() @IsIn(REMINDER_STATUSES) status?: ReminderStatus;
  @IsOptional() @IsDateString() snoozeUntil?: string;
}
export class ReminderFiltersDto {
  @IsOptional() @IsIn(REMINDER_STATUSES) status?: ReminderStatus;
  @IsOptional() @IsIn(['today', 'upcoming', 'past']) schedule?:
    'today' | 'upcoming' | 'past';

  @IsOptional() @IsString() search?: string;
}
