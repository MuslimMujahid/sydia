import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsOptional,
  IsString,
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
  @Type(() => Date) @IsDate() startAt!: Date;
  @Type(() => Date) @IsDate() endAt!: Date;
  @IsString() timezone!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) attendees?: string[];
}
export class UpdateCalendarEventDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(300) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
  @IsOptional() @IsString() @MaxLength(500) location?: string | null;
  @IsOptional() @Type(() => Date) @IsDate() startAt?: Date;
  @IsOptional() @Type(() => Date) @IsDate() endAt?: Date;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) attendees?: string[];
}
