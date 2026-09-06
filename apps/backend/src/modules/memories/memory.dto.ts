import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MEMORY_STATUSES, type MemoryStatus } from '../../database/entities';

export class CreateMemoryDto {
  @IsString() @MinLength(1) @MaxLength(8000) content!: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string | null;
}
export class UpdateMemoryDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(8000) content?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string | null;
  @IsOptional() @IsIn(MEMORY_STATUSES) status?: MemoryStatus;
  @IsOptional() @IsBoolean() pinned?: boolean;
}
export class MemoryFiltersDto {
  @IsOptional() @IsIn(MEMORY_STATUSES) status?: MemoryStatus;
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === true || value === 'true',
  )
  @IsBoolean()
  pinned?: boolean;
}
export class MemorySearchDto {
  @IsString() @MinLength(1) @MaxLength(1000) q!: string;
}
