import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { WhatsAppService } from './whatsapp.service';
import { ApiException, ErrorCodes } from '../../shared/errors';

class PairCompanionDto {
  @IsString()
  @Matches(/^\d{8,15}$/)
  phone!: string;
}

@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsapp: WhatsAppService) {}

  @Get('status')
  status(@Session() session: UserSession) {
    return this.whatsapp.status(session.user.id);
  }

  @Post('link-code')
  linkCode(@Session() session: UserSession) {
    return this.whatsapp.createLinkCode(session.user.id);
  }

  @Roles(['admin'])
  @Post('companion/pair-code')
  async pairCompanion(@Body() input: PairCompanionDto) {
    try {
      return await this.whatsapp.pairCompanion(input.phone);
    } catch (error) {
      const providerCode =
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : undefined;

      throw new ApiException({
        code: ErrorCodes.SERVICE_UNAVAILABLE,
        message:
          'WhatsApp belum dapat membuat kode pairing. Periksa status koneksi lalu coba lagi.',
        details: providerCode ? { providerCode } : {},
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });
    }
  }

  @Delete('link')
  revoke(@Session() session: UserSession) {
    return this.whatsapp.revoke(session.user.id);
  }
}
