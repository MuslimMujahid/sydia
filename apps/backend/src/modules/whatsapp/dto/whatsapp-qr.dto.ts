import { IsBoolean, IsOptional } from 'class-validator';

export class WhatsAppQrDto {
  @IsOptional()
  @IsBoolean()
  refresh?: boolean;
}
