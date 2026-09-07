import { Controller, Delete, Get, HttpStatus, Post } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Get('status')
  status(@Session() session: UserSession) {
    return this.telegram.status(session.user.id);
  }

  @Post('link')
  async link(@Session() session: UserSession) {
    try {
      return await this.telegram.createLink(session.user.id);
    } catch {
      throw new ApiException({
        code: ErrorCodes.SERVICE_UNAVAILABLE,
        message:
          'Bot Telegram belum tersedia. Coba lagi setelah konfigurasi server diperiksa.',
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });
    }
  }

  @Delete('link')
  revoke(@Session() session: UserSession) {
    return this.telegram.revoke(session.user.id);
  }
}
