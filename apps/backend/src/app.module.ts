import { MiddlewareConsumer, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AllExceptionsFilter } from './shared/errors';
import { ResponseInterceptor } from './shared/response';
import { RequestLoggingMiddleware } from './shared/logging';
import { AuthModule } from './infra/auth';
import { PrismaModule } from './infra/prisma';
import { UsersModule } from './modules/users/users.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

function parsePort(
  config: Record<string, unknown>,
  name: 'BACKEND_PORT' | 'FRONTEND_PORT' | 'BACKEND_DB_PORT',
  defaultValue: number,
): number {
  const value =
    config[name] === undefined ? defaultValue : Number(config[name]);

  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }

  return value;
}

function parseFrontendUrl(
  config: Record<string, unknown>,
  frontendPort: number,
): string {
  const configuredUrl = config.FRONTEND_URL;
  const value =
    typeof configuredUrl === 'string' && configuredUrl.trim() !== ''
      ? configuredUrl.trim()
      : `http://localhost:${frontendPort}`;

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(
      'FRONTEND_URL must be an absolute http or https URL without a path, query, or hash',
    );
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== '' ||
    url.username !== '' ||
    url.password !== ''
  ) {
    throw new Error(
      'FRONTEND_URL must be an absolute http or https URL without a path, query, or hash',
    );
  }

  return url.origin;
}

function requireString(config: Record<string, unknown>, name: string): string {
  const value = config[name];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string`);
  }

  return value;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const backendPort = parsePort(config, 'BACKEND_PORT', 5000);
  const frontendPort = parsePort(config, 'FRONTEND_PORT', 3000);
  const authUrl = config.BACKEND_AUTH_URL;

  return {
    ...config,
    BACKEND_PORT: backendPort,
    FRONTEND_PORT: frontendPort,
    FRONTEND_URL: parseFrontendUrl(config, frontendPort),
    BACKEND_DB_HOST: requireString(config, 'BACKEND_DB_HOST'),
    BACKEND_DB_PORT: parsePort(config, 'BACKEND_DB_PORT', 5432),
    BACKEND_DB_USER: requireString(config, 'BACKEND_DB_USER'),
    BACKEND_DB_PASSWORD: requireString(config, 'BACKEND_DB_PASSWORD'),
    BACKEND_DB_NAME: requireString(config, 'BACKEND_DB_NAME'),
    BACKEND_AUTH_SECRET: requireString(config, 'BACKEND_AUTH_SECRET'),
    BACKEND_AUTH_URL:
      typeof authUrl === 'string' && authUrl.trim() !== ''
        ? authUrl
        : `http://localhost:${backendPort}`,
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService, AllExceptionsFilter, ResponseInterceptor],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
