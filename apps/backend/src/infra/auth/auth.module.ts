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
    CategoriesModule,
    BetterAuthModule.forRootAsync({
      inject: [
        ConfigService,
        PrismaService,
        AUDIT_EVENT_REPOSITORY,
        CATEGORY_REPOSITORY,
      ],
      useFactory: (
        config: ConfigService,
        prisma: PrismaService,
        auditEventRepository: IAuditEventRepository,
        categoryRepository: ICategoryRepository,
      ) => ({
        auth: createAuth(prisma, {
          secret: config.getOrThrow<string>('BACKEND_AUTH_SECRET'),
          baseURL: config.getOrThrow<string>('BACKEND_AUTH_URL'),
          trustedOrigins: [config.getOrThrow<string>('FRONTEND_URL')],
          auditEventRepository,
          provisionDefaultCategories: (userId) =>
            categoryRepository.provisionDefaults(userId),
        }),
        bodyParser: { rawBody: true },
      }),
    }),
  ],
})
export class AuthModule {}
