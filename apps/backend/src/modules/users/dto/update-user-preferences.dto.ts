import { IsBoolean } from 'class-validator';

export class UpdateUserPreferencesDto {
  @IsBoolean()
  automaticMemoryEnabled!: boolean;
}
