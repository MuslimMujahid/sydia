import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import {
  AUDIT_EVENT_REPOSITORY,
  CATEGORY_REPOSITORY,
  type IAuditEventRepository,
  type ICategoryRepository,
} from '../../database/interfaces';
import { AuditModule } from '../../database/audit.module';
import { CategoriesModule } from '../../modules/categories/categories.module';
import { getFrontendOrigins } from '../../shared/frontend-origins';
import { PrismaService } from '../prisma';
import { createAuth } from './auth';
import { AuthMailService } from './auth-mail.service';
import { AuthSecurityService } from './auth-security.service';
import { APP_GUARD } from '@nestjs/core';
import { VerifiedEmailGuard } from './verified-email.guard';

@Module({
  providers: [AuthMailService, AuthSecurityService],
  exports: [AuthMailService, AuthSecurityService],
})
export class AuthSupportModule {}

/**
 * Wires Better Auth into NestJS. The integration module mounts the auth
 * handler at /api/auth/* and registers a global AuthGuard: every route is
 * protected unless annotated with @AllowAnonymous() or @OptionalAuth().
 */
@Module({
  imports: [
    AuditModule,
    CategoriesModule,
    BetterAuthModule.forRootAsync({
      imports: [AuthSupportModule],
      inject: [
        ConfigService,
        PrismaService,
        AUDIT_EVENT_REPOSITORY,
        CATEGORY_REPOSITORY,
        AuthMailService,
        AuthSecurityService,
      ],
      useFactory: (
        config: ConfigService,
        prisma: PrismaService,
        auditEventRepository: IAuditEventRepository,
        categoryRepository: ICategoryRepository,
        mail: AuthMailService,
        security: AuthSecurityService,
      ) => ({
        auth: createAuth(prisma, {
          googleIdentity: googleIdentityConfig(config),
          sendAuthMail: (data) => mail.send(data),
          security,
          secret: config.getOrThrow<string>('BACKEND_AUTH_SECRET'),
          baseURL: config.getOrThrow<string>('BACKEND_AUTH_URL'),
          trustedOrigins: getFrontendOrigins(
            config.getOrThrow<string>('FRONTEND_URL'),
          ),
          auditEventRepository,
          provisionDefaultCategories: (userId) =>
            categoryRepository.provisionDefaults(userId),
        }),
        bodyParser: { rawBody: true },
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: VerifiedEmailGuard }],
})
export class AuthModule {}

function googleIdentityConfig(
  config: ConfigService,
): { clientId: string; clientSecret: string } | undefined {
  const clientId = config.get<string>('BACKEND_GOOGLE_IDENTITY_CLIENT_ID');
  const clientSecret = config.get<string>(
    'BACKEND_GOOGLE_IDENTITY_CLIENT_SECRET',
  );

  if (!clientId && !clientSecret) return undefined;
  if (!clientId || !clientSecret)
    throw new Error(
      'Configure both BACKEND_GOOGLE_IDENTITY_CLIENT_ID and BACKEND_GOOGLE_IDENTITY_CLIENT_SECRET.',
    );
  const calendarClientId = config.get<string>('BACKEND_GOOGLE_CLIENT_ID');
  if (
    calendarClientId &&
    calendarClientId.split('-')[0] === clientId.split('-')[0]
  )
    throw new Error(
      'Google identity and Calendar OAuth credentials must belong to separate Google Cloud projects.',
    );

  return { clientId, clientSecret };
}
