import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  ASSISTANT_PERSONAS,
  type AssistantPersona,
} from '../../../database/entities';

const ASSISTANT_VERBOSITIES = ['concise', 'balanced', 'detailed'] as const;
const ASSISTANT_STYLES = ASSISTANT_PERSONAS;

export class UpdateUserPreferencesDto {
  @IsOptional()
  @IsBoolean()
  automaticMemoryEnabled?: boolean;

  @IsOptional()
  @IsIn(ASSISTANT_PERSONAS)
  persona?: AssistantPersona;

  @IsOptional()
  @IsIn(ASSISTANT_VERBOSITIES)
  assistantVerbosity?: (typeof ASSISTANT_VERBOSITIES)[number];

  @IsOptional()
  @IsIn(ASSISTANT_STYLES)
  assistantStyle?: AssistantPersona;

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
