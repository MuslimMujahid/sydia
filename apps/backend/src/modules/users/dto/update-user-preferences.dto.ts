import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
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
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  briefingTime?: string;

  @IsOptional()
  @IsBoolean()
  webNotificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  whatsappNotificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  emailNotificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  proactivePaused?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  retentionDays?: number;
}
