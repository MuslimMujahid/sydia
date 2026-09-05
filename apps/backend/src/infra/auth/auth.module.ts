import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import { PrismaService } from '../prisma';
import { createAuth } from './auth';

/**
 * Wires Better Auth into NestJS. The integration module mounts the auth
 * handler at /api/auth/* and registers a global AuthGuard: every route is
 * protected unless annotated with @AllowAnonymous() or @OptionalAuth().
 */
@Module({
  imports: [
    BetterAuthModule.forRootAsync({
      inject: [ConfigService, PrismaService],
      useFactory: (config: ConfigService, prisma: PrismaService) => ({
        auth: createAuth(prisma, {
          secret: config.getOrThrow<string>('BACKEND_AUTH_SECRET'),
          baseURL: config.getOrThrow<string>('BACKEND_AUTH_URL'),
          trustedOrigins: [
            `http://localhost:${config.get<number>('FRONTEND_PORT', 3000)}`,
          ],
        }),
      }),
    }),
  ],
})
export class AuthModule {}
