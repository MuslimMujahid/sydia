import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateContactDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) aliases?: string[];
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsString() @MaxLength(50) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string | null;
}
export class UpdateContactDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) aliases?: string[];
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsString() @MaxLength(50) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string | null;
}
