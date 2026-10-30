import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class AdminGiftPlusDto {
  @IsInt()
  @Min(1)
  @Max(3650)
  durationDays!: number;

  @IsUUID('4')
  requestId!: string;
}
