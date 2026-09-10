import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSecretDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8_192)
  value!: string;
}

export class ConsumeSecretRevealDto {
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  token!: string;
}

export class UnlockSecretVaultDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;
}
