import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const normalizeName = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

export class CreateContactDto {
  @Transform(normalizeName)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional() @IsArray() @IsString({ each: true }) aliases?: string[];
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsString() @MaxLength(50) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) groupIds?: string[];
}

export class UpdateContactDto {
  @IsOptional()
  @Transform(normalizeName)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) aliases?: string[];
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsString() @MaxLength(50) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) groupIds?: string[];
}

export class CreateContactGroupDto {
  @Transform(normalizeName)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;
}

export class UpdateContactGroupDto {
  @IsOptional()
  @Transform(normalizeName)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name?: string;
}
