import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AllExceptionsFilter } from './shared/errors';
import { ResponseInterceptor } from './shared/response';
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
  const authUrl = config.BACKEND_AUTH_URL;

  return {
    ...config,
    BACKEND_PORT: backendPort,
    FRONTEND_PORT: parsePort(config, 'FRONTEND_PORT', 3000),
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
export class AppModule {}
