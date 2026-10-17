import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  IsNotEmpty,
  ValidateIf,
} from 'class-validator';

export class CreateWorkspaceItemDto {
  @IsIn(['note', 'folder']) kind!: 'note' | 'folder';
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(240)
  title?: string;

  @IsOptional() @IsString() parentId?: string | null;
  @IsString() @IsNotEmpty() @MaxLength(240) requestKey!: string;
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsObject()
  content?: Record<string, unknown>;
}

export class UpdateWorkspaceItemDto {
  @IsInt() @Min(1) revision!: number;
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(240)
  title?: string;

  @IsOptional() @IsString() parentId?: string | null;
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsObject()
  content?: Record<string, unknown>;
}

export class WorkspaceRevisionDto {
  @IsInt() @Min(1) revision!: number;
  @IsOptional() @IsString() parentId?: string | null;
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(240)
  title?: string;
}

export class WorkspaceSearchDto {
  @IsString() @MaxLength(400) query!: string;
  @IsOptional() @IsIn(['note', 'daily']) kind?: 'note' | 'daily';
  @IsOptional() @IsString() folderId?: string;
}
