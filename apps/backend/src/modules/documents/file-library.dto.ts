import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class FileLibraryQueryDto {
  @IsOptional() @IsString() @MinLength(1) folderId?: string;
  @IsOptional() @IsString() @MaxLength(255) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
  @IsOptional() @IsIn(['name', 'createdAt']) sort: 'name' | 'createdAt' =
    'name';

  @IsOptional() @IsIn(['asc', 'desc']) direction: 'asc' | 'desc' = 'asc';
  @IsOptional() @IsIn(['true', 'false']) foldersOnly?: string;
}

export class CreateFileFolderDto {
  @IsString() @MaxLength(1024) name!: string;
  @IsOptional() @IsString() @MinLength(1) parentId?: string | null;
}

export class RenameFileFolderDto {
  @IsString() @MaxLength(1024) name!: string;
  @IsInt() @Min(1) revision!: number;
}

export class FileLibraryRefDto {
  @IsIn(['file', 'folder']) kind!: 'file' | 'folder';
  @IsString() @MinLength(1) @MaxLength(128) id!: string;
  @IsInt() @Min(1) revision!: number;
}

export class FileLibrarySelectionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => FileLibraryRefDto)
  items!: FileLibraryRefDto[];
}

export class MoveFileLibraryDto extends FileLibrarySelectionDto {
  @IsOptional() @IsString() @MinLength(1) destinationId?: string | null;
}

export class UploadFileFolderDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) folderId?: string;
}

export class StartFileDeletionDto {
  @IsString() @MinLength(1) @MaxLength(128) previewId!: string;
  @IsString() @MinLength(1) @MaxLength(128) idempotencyKey!: string;
}

export class RetryFileDeletionDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) previewId?: string;
}
