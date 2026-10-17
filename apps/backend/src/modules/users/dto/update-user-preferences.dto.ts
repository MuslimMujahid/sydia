import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  ASSISTANT_PERSONAS,
  type AssistantPersona,
} from '../../../database/entities';

export class UpdateUserPreferencesDto {
  @IsOptional()
  @IsBoolean()
  automaticMemoryEnabled?: boolean;

  @IsOptional()
  @IsIn(ASSISTANT_PERSONAS)
  persona?: AssistantPersona;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
  })
  preferredAddress?: string | null;

  @IsOptional()
  @IsBoolean()
  briefingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  weeklyBriefingEnabled?: boolean;

  @IsOptional()
  @IsIn([1, 2, 3, 4, 5, 6, 7])
  weeklyBriefingDay?: number;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  briefingTime?: string;

  @IsOptional()
  @IsIn([30, 60, 120, 180])
  followUpIntervalMinutes?: number;

  @IsOptional()
  @IsBoolean()
  webNotificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  telegramNotificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  whatsappNotificationsEnabled?: boolean;
}
