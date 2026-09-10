import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  AllowAnonymous,
  AuthService,
  Roles,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import { ApiException, ErrorCodes } from '../../shared/errors';
import {
  ConsumeSecretRevealDto,
  CreateSecretDto,
  UnlockSecretVaultDto,
} from './secrets.dto';
import { SecretsService } from './secrets.service';

@Roles(['user'])
@Controller('secrets')
export class SecretsController {
  constructor(
    private readonly secrets: SecretsService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  list(@Session() session: UserSession) {
    return this.secrets.list(session.user.id);
  }

  @Post()
  create(@Session() session: UserSession, @Body() input: CreateSecretDto) {
    return this.secrets.create(session.user.id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Session() session: UserSession, @Param('id') id: string) {
    if (!(await this.secrets.delete(session.user.id, id))) {
      throw this.notFound();
    }
  }

  @Post(':id/reveal-links')
  async createRevealLink(
    @Session() session: UserSession,
    @Param('id') id: string,
  ) {
    const link = await this.secrets.createRevealLink(session.user.id, id);
    if (!link) throw this.notFound();

    return link;
  }

  @Post('unlock')
  async unlock(
    @Session() session: UserSession,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() input: UnlockSecretVaultDto,
  ) {
    const authHeaders = new globalThis.Headers();

    for (const [name, value] of Object.entries(headers)) {
      if (value !== undefined) {
        authHeaders.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
    }

    await this.auth.api.verifyPassword({
      body: { password: input.password },
      headers: authHeaders,
    });
    const expiresAt = new Date(session.session.expiresAt);
    await this.secrets.unlockSession(
      session.user.id,
      session.session.id,
      expiresAt,
    );

    return { expiresAt };
  }

  @Post(':id/reveal')
  async revealInSession(
    @Session() session: UserSession,
    @Param('id') id: string,
  ) {
    try {
      const revealed = await this.secrets.revealInSession(
        session.user.id,
        session.session.id,
        id,
      );

      if (!revealed) throw this.notFound();

      return revealed;
    } catch (error) {
      if (error instanceof Error && error.message === 'SECRET_VAULT_LOCKED') {
        throw new ApiException({
          code: ErrorCodes.FORBIDDEN,
          message: 'Konfirmasikan kata sandi untuk membuka vault.',
          status: HttpStatus.FORBIDDEN,
        });
      }

      throw error;
    }
  }

  private notFound(): ApiException {
    return new ApiException({
      code: ErrorCodes.NOT_FOUND,
      message: 'Secret tidak ditemukan.',
      status: HttpStatus.NOT_FOUND,
    });
  }
}

@Controller('secret-reveals')
export class SecretRevealsController {
  constructor(private readonly secrets: SecretsService) {}

  @AllowAnonymous()
  @Post('consume')
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @Header('Referrer-Policy', 'no-referrer')
  async consume(@Body() input: ConsumeSecretRevealDto) {
    const revealed = await this.secrets.reveal(input.token);

    if (!revealed) {
      throw new ApiException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Tautan sudah dipakai, kedaluwarsa, atau tidak valid.',
        status: HttpStatus.GONE,
      });
    }

    return revealed;
  }
}
