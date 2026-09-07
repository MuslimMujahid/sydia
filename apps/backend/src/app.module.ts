import { MiddlewareConsumer, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AllExceptionsFilter } from './shared/errors';
import { ResponseInterceptor } from './shared/response';
import { RequestLoggingMiddleware } from './shared/logging';
import { AuthModule } from './infra/auth';
import { PrismaModule } from './infra/prisma';
import { QueueModule } from './infra/queue';
import { UsersModule } from './modules/users/users.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { MemoriesModule } from './modules/memories/memories.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { TodayModule } from './modules/today/today.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { AdminModule } from './modules/admin/admin.module';
import { StorageModule } from './infra/storage';
import { CryptoModule } from './infra/crypto';
import { WhatsAppInfraModule } from './infra/whatsapp';
import { WhatsAppModule } from './modules/whatsapp';
import { NotificationsModule } from './modules/notifications';
import { AppController } from './app.controller';
import { AppService } from './app.service';

function parsePort(
  config: Record<string, unknown>,
  name:
    'BACKEND_PORT' | 'FRONTEND_PORT' | 'BACKEND_DB_PORT' | 'BACKEND_REDIS_PORT',
  defaultValue: number,
): number {
  const value =
    config[name] === undefined ? defaultValue : Number(config[name]);

  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }

  return value;
}

function parsePositiveInteger(
  config: Record<string, unknown>,
  name:
    | 'BACKEND_ASSISTANT_CONTEXT_TOKENS'
    | 'BACKEND_SUMMARY_TRIGGER_TOKENS'
    | 'BACKEND_SUMMARY_RETAIN_MESSAGES'
    | 'BACKEND_WHATSAPP_COMMAND_TIMEOUT',
  defaultValue: number,
): number {
  const value =
    config[name] === undefined || config[name] === ''
      ? defaultValue
      : Number(config[name]);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
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
    BACKEND_REDIS_HOST:
      typeof config.BACKEND_REDIS_HOST === 'string' &&
      config.BACKEND_REDIS_HOST.trim() !== ''
        ? config.BACKEND_REDIS_HOST.trim()
        : 'localhost',
    BACKEND_REDIS_PORT: parsePort(config, 'BACKEND_REDIS_PORT', 6379),
    BACKEND_AUTH_SECRET: requireString(config, 'BACKEND_AUTH_SECRET'),
    BACKEND_AUTH_URL:
      typeof authUrl === 'string' && authUrl.trim() !== ''
        ? authUrl
        : `http://localhost:${backendPort}`,
    BACKEND_MODEL_API_KEY:
      typeof config.BACKEND_MODEL_API_KEY === 'string'
        ? config.BACKEND_MODEL_API_KEY.trim()
        : '',
    BACKEND_MODEL_BASE_URL:
      typeof config.BACKEND_MODEL_BASE_URL === 'string' &&
      config.BACKEND_MODEL_BASE_URL.trim() !== ''
        ? config.BACKEND_MODEL_BASE_URL.trim()
        : 'https://openrouter.ai/api/v1',
    BACKEND_MODEL_NAME:
      typeof config.BACKEND_MODEL_NAME === 'string' &&
      config.BACKEND_MODEL_NAME.trim() !== ''
        ? config.BACKEND_MODEL_NAME.trim()
        : 'z-ai/glm-5.3-flash',
    BACKEND_EMBEDDING_MODEL:
      typeof config.BACKEND_EMBEDDING_MODEL === 'string' &&
      config.BACKEND_EMBEDDING_MODEL.trim() !== ''
        ? config.BACKEND_EMBEDDING_MODEL.trim()
        : 'openai/text-embedding-3-small',
    BACKEND_STT_MODEL:
      typeof config.BACKEND_STT_MODEL === 'string' &&
      config.BACKEND_STT_MODEL.trim() !== ''
        ? config.BACKEND_STT_MODEL.trim()
        : 'openai/whisper-large-v3-turbo',
    BACKEND_ASSISTANT_CONTEXT_TOKENS: parsePositiveInteger(
      config,
      'BACKEND_ASSISTANT_CONTEXT_TOKENS',
      6000,
    ),
    BACKEND_SUMMARY_TRIGGER_TOKENS: parsePositiveInteger(
      config,
      'BACKEND_SUMMARY_TRIGGER_TOKENS',
      4500,
    ),
    BACKEND_SUMMARY_RETAIN_MESSAGES: parsePositiveInteger(
      config,
      'BACKEND_SUMMARY_RETAIN_MESSAGES',
      8,
    ),
    BACKEND_WHATSAPP_STORE_PATH:
      typeof config.BACKEND_WHATSAPP_STORE_PATH === 'string' &&
      config.BACKEND_WHATSAPP_STORE_PATH.trim() !== ''
        ? config.BACKEND_WHATSAPP_STORE_PATH.trim()
        : '.data/whatsapp',
    BACKEND_WHATSAPP_COMMAND_TIMEOUT: parsePositiveInteger(
      config,
      'BACKEND_WHATSAPP_COMMAND_TIMEOUT',
      30_000,
    ),
    BACKEND_WHATSAPP_RUNTIME_ENABLED:
      config.BACKEND_WHATSAPP_RUNTIME_ENABLED !== 'false',
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PrismaModule,
    QueueModule,
    CategoriesModule,
    AuthModule,
    UsersModule,
    ConversationsModule,
    TasksModule,
    RemindersModule,
    MemoriesModule,
    TodayModule,
    CryptoModule,
    StorageModule,
    DocumentsModule,
    ContactsModule,
    CalendarModule,
    AdminModule,
    WhatsAppInfraModule,
    NotificationsModule,
    WhatsAppModule,
  ],
  controllers: [AppController],
  providers: [AppService, AllExceptionsFilter, ResponseInterceptor],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
