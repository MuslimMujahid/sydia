import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

/**
 * First-touch acquisition data forwarded from the landing page.
 * Everything is optional: the app may reach signup without a campaign.
 */
export class RecordAttributionDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Za-z0-9._~-]{8,64}$/, {
    message: 'visitorId must be an opaque identifier',
  })
  visitorId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  utmSource?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  utmMedium?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  utmCampaign?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  utmContent?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  utmTerm?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  referrer?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  landingPath?: string;
}
