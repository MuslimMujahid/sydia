import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsString,
  IsTimeZone,
  ValidateIf,
} from 'class-validator';
import { SUPPORTED_LOCALES } from '../../../database/entities';

export class UpdateUserProfileDto {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @IsTimeZone()
  timezone?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @IsIn(SUPPORTED_LOCALES)
  locale?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  onboardingCompleted?: boolean;
}
