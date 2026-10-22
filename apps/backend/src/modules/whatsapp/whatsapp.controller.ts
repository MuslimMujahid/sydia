import {
  Controller,
  Body,
  Delete,
  Get,
  Header,
  HttpStatus,
  Logger,
  Param,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppQrDto } from './dto/whatsapp-qr.dto';
import { APIError } from 'better-auth/api';
import { AuthSecurityService } from '../../infra/auth';
import { ApiException, ErrorCodes } from '../../shared/errors';
import {
  WhatsAppConnectionConflict,
  WhatsAppConnectionRevoked,
} from '../../database/entities';

@Controller('whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);
  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly security: AuthSecurityService,
  ) {}

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.logger.error('WhatsApp connection operation failed.', error);
      if (error instanceof ApiException) throw error;

      if (error instanceof APIError && error.status === 'TOO_MANY_REQUESTS') {
        throw new ApiException({
          code: ErrorCodes.TOO_MANY_REQUEST,
          status: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Terlalu banyak upaya penautan. Coba lagi sebentar.',
          details: { retryAfter: error.body?.retryAfter },
        });
      }

      const conflict =
        error instanceof WhatsAppConnectionConflict ||
        error instanceof WhatsAppConnectionRevoked;

      throw new ApiException({
        code: conflict ? ErrorCodes.CONFLICT : ErrorCodes.SERVICE_UNAVAILABLE,
        message: conflict
          ? 'Akun WhatsApp tidak dapat digunakan pada koneksi ini. Periksa status lalu coba kembali.'
          : 'WhatsApp belum dapat dihubungkan. Periksa koneksi lalu coba lagi.',
        status: conflict ? HttpStatus.CONFLICT : HttpStatus.SERVICE_UNAVAILABLE,
      });
    }
  }

  @Get('status')
  @Header('Cache-Control', 'no-store')
  status(@Session() session: UserSession) {
    return this.execute(() => this.whatsapp.status(session.user.id));
  }

  @Post('companion/qr')
  @Header('Cache-Control', 'no-store')
  qr(@Session() session: UserSession, @Body() input: WhatsAppQrDto = {}) {
    return this.execute(async () => {
      await this.security.limitWhatsAppSetup(session.user.id);

      return this.whatsapp.beginQr(session.user.id, input.refresh === true);
    });
  }

  @Get('companion/qr/:attemptId')
  @Header('Cache-Control', 'no-store, private')
  async qrAsset(
    @Session() session: UserSession,
    @Param('attemptId') attemptId: string,
  ) {
    const bytes = await this.execute(() =>
      this.whatsapp.qrAsset(session.user.id, attemptId),
    );

    return new StreamableFile(bytes, {
      type: 'image/png',
      disposition: 'inline',
    });
  }

  @Post('link-code')
  @Header('Cache-Control', 'no-store')
  linkCode(@Session() session: UserSession) {
    return this.execute(async () => {
      await this.security.limitWhatsAppSetup(session.user.id);

      return this.whatsapp.createLinkCode(session.user.id);
    });
  }

  @Post('owner/replace')
  @Header('Cache-Control', 'no-store')
  replaceOwner(@Session() session: UserSession) {
    return this.execute(async () => {
      await this.security.limitWhatsAppSetup(session.user.id);

      return this.whatsapp.replaceOwner(session.user.id);
    });
  }

  @Post('reconnect')
  reconnect(@Session() session: UserSession) {
    return this.execute(async () => {
      await this.security.limitWhatsAppSetup(session.user.id);

      return this.whatsapp.reconnect(session.user.id);
    });
  }

  @Delete('link')
  revoke(@Session() session: UserSession) {
    return this.execute(() => this.whatsapp.revoke(session.user.id));
  }
}
