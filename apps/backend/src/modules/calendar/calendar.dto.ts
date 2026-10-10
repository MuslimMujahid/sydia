import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CalendarRangeDto {
  @Type(() => Date) @IsDate() from!: Date;
  @Type(() => Date) @IsDate() to!: Date;
}
export class CreateCalendarEventDto {
  @IsString() @MinLength(1) @MaxLength(300) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
  @IsOptional() @IsString() @MaxLength(500) location?: string | null;
  @IsOptional() @Type(() => Date) @IsDate() startAt?: Date;
  @IsOptional() @Type(() => Date) @IsDate() endAt?: Date;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @Type(() => Date) @IsDate() allDayStartDate?: Date;
  @IsOptional() @Type(() => Date) @IsDate() allDayEndDate?: Date;
  @IsOptional() @IsArray() @IsString({ each: true }) attendees?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) recurrence?: string[];
  @IsOptional() @IsIn(['auto', 'local', 'google']) destination?:
    'auto' | 'local' | 'google';
}
export class UpdateCalendarEventDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(300) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
  @IsOptional() @IsString() @MaxLength(500) location?: string | null;
  @IsOptional() @Type(() => Date) @IsDate() startAt?: Date;
  @IsOptional() @Type(() => Date) @IsDate() endAt?: Date;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @Type(() => Date) @IsDate() allDayStartDate?: Date;
  @IsOptional() @Type(() => Date) @IsDate() allDayEndDate?: Date;
  @IsOptional() @IsArray() @IsString({ each: true }) attendees?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) recurrence?: string[];
}

export class ResolveCalendarConflictDto {
  @IsIn(['keep_sydia', 'use_google'])
  resolution!: 'keep_sydia' | 'use_google';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedLocalRevision!: number;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  expectedRemoteEtag?: string | null;
}

export class SelectGoogleCalendarDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  calendarId!: string;
}

export class ResolveCalendarOccurrenceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  seriesEventId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  occurrenceKey!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  instanceEventId?: string;
}
