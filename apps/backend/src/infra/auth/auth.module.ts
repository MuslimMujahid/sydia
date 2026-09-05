import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../database/interfaces';
import { AuditModule } from '../../database/audit.module';
import { PrismaService } from '../prisma';
import { createAuth } from './auth';

/**
 * Wires Better Auth into NestJS. The integration module mounts the auth
 * handler at /api/auth/* and registers a global AuthGuard: every route is
 * protected unless annotated with @AllowAnonymous() or @OptionalAuth().
 */
@Module({
  imports: [
    AuditModule,
    BetterAuthModule.forRootAsync({
      inject: [ConfigService, PrismaService, AUDIT_EVENT_REPOSITORY],
      useFactory: (
        config: ConfigService,
        prisma: PrismaService,
        auditEventRepository: IAuditEventRepository,
      ) => ({
        auth: createAuth(prisma, {
          secret: config.getOrThrow<string>('BACKEND_AUTH_SECRET'),
          baseURL: config.getOrThrow<string>('BACKEND_AUTH_URL'),
          trustedOrigins: [config.getOrThrow<string>('FRONTEND_URL')],
          auditEventRepository,
        }),
      }),
    }),
  ],
})
export class AuthModule {}
