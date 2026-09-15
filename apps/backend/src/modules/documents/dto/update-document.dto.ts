import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateDocumentDto {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title?: string;

  @ValidateIf(
    (_object: unknown, value: unknown) => value !== undefined && value !== null,
  )
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();

    return trimmed === '' ? null : trimmed;
  })
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}
