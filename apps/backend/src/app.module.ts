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
import { TelegramInfraModule } from './infra/telegram';
import { TelegramModule } from './modules/telegram';
import { NotificationsModule } from './modules/notifications';
import { AppController } from './app.controller';
import { ObservabilityModule } from './infra/observability';
import { AppService } from './app.service';
import { SecretsModule } from './modules/secrets/secrets.module';

function parsePort(
  config: Record<string, unknown>,
  name: 'BACKEND_PORT' | 'FRONTEND_PORT',
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
    | 'BACKEND_MODEL_MAX_OUTPUT_TOKENS'
    | 'BACKEND_MODEL_MAX_STEPS'
    | 'BACKEND_SUMMARY_TRIGGER_TOKENS'
    | 'BACKEND_SUMMARY_RETAIN_MESSAGES'
    | 'BACKEND_MEMORY_DREAM_MIN_USER_MESSAGES'
    | 'BACKEND_MEMORY_DREAM_MIN_TOKENS'
    | 'BACKEND_MEMORY_DREAM_IDLE_MS'
    | 'BACKEND_MEMORY_DREAM_SHORT_SEGMENT_AGE_MS'
    | 'BACKEND_WHATSAPP_COMMAND_TIMEOUT'
    | 'BACKEND_WHATSAPP_STATUS_POLL_MS',
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

function parseUnitInterval(
  config: Record<string, unknown>,
  name: 'BACKEND_MEMORY_MAX_COSINE_DISTANCE',
  defaultValue: number,
): number {
  const value =
    config[name] === undefined || config[name] === ''
      ? defaultValue
      : Number(config[name]);

  if (!Number.isFinite(value) || value < 0 || value > 2) {
    throw new Error(`${name} must be a number between 0 and 2`);
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

function parseDatabaseUrl(config: Record<string, unknown>): string {
  const value = requireString(config, 'BACKEND_DB_URL');

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('BACKEND_DB_URL must be a valid PostgreSQL connection URL');
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error(
      'BACKEND_DB_URL must use the postgresql:// or postgres:// scheme',
    );
  }

  return value;
}

function parseRedisUrl(config: Record<string, unknown>): string {
  const configured = config.BACKEND_REDIS_URL;
  const value =
    typeof configured === 'string' && configured.trim() !== ''
      ? configured.trim()
      : 'redis://localhost:6379';

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('BACKEND_REDIS_URL must be a valid Redis connection URL');
  }

  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error(
      'BACKEND_REDIS_URL must use the redis:// or rediss:// scheme',
    );
  }

  return value;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const backendPort = parsePort(config, 'BACKEND_PORT', 5000);
  const frontendPort = parsePort(config, 'FRONTEND_PORT', 3000);
  const authUrl = config.BACKEND_AUTH_URL;
  const langfusePublicKey =
    typeof config.BACKEND_LANGFUSE_PUBLIC_KEY === 'string'
      ? config.BACKEND_LANGFUSE_PUBLIC_KEY.trim()
      : '';

  const langfuseSecretKey =
    typeof config.BACKEND_LANGFUSE_SECRET_KEY === 'string'
      ? config.BACKEND_LANGFUSE_SECRET_KEY.trim()
      : '';

  const langfuseBaseUrl =
    typeof config.BACKEND_LANGFUSE_BASE_URL === 'string' &&
    config.BACKEND_LANGFUSE_BASE_URL.trim() !== ''
      ? config.BACKEND_LANGFUSE_BASE_URL.trim()
      : 'https://cloud.langfuse.com';

  if (Boolean(langfusePublicKey) !== Boolean(langfuseSecretKey)) {
    throw new Error(
      'BACKEND_LANGFUSE_PUBLIC_KEY and BACKEND_LANGFUSE_SECRET_KEY must be provided together',
    );
  }

  let parsedLangfuseBaseUrl: URL;

  try {
    parsedLangfuseBaseUrl = new URL(langfuseBaseUrl);
  } catch {
    throw new Error(
      'BACKEND_LANGFUSE_BASE_URL must be an absolute http or https URL',
    );
  }

  if (
    parsedLangfuseBaseUrl.protocol !== 'http:' &&
    parsedLangfuseBaseUrl.protocol !== 'https:'
  ) {
    throw new Error(
      'BACKEND_LANGFUSE_BASE_URL must be an absolute http or https URL',
    );
  }

  return {
    ...config,
    BACKEND_PORT: backendPort,
    FRONTEND_PORT: frontendPort,
    FRONTEND_URL: parseFrontendUrl(config, frontendPort),
    BACKEND_DB_URL: parseDatabaseUrl(config),
    BACKEND_REDIS_URL: parseRedisUrl(config),
    BACKEND_AUTH_SECRET: requireString(config, 'BACKEND_AUTH_SECRET'),
    BACKEND_SECRET_ENCRYPTION_KEY: requireString(
      config,
      'BACKEND_SECRET_ENCRYPTION_KEY',
    ),
    BACKEND_AUTH_URL:
      typeof authUrl === 'string' && authUrl.trim() !== ''
        ? authUrl
        : `http://localhost:${backendPort}`,
    BACKEND_LANGFUSE_PUBLIC_KEY: langfusePublicKey,
    BACKEND_LANGFUSE_SECRET_KEY: langfuseSecretKey,
    BACKEND_LANGFUSE_BASE_URL: langfuseBaseUrl,
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
        : 'qwen/qwen3.8-flash',
    BACKEND_MODEL_MAX_OUTPUT_TOKENS: parsePositiveInteger(
      config,
      'BACKEND_MODEL_MAX_OUTPUT_TOKENS',
      1200,
    ),
    BACKEND_MODEL_MAX_STEPS: parsePositiveInteger(
      config,
      'BACKEND_MODEL_MAX_STEPS',
      8,
    ),
    BACKEND_MODEL_PROVIDER_SORT:
      typeof config.BACKEND_MODEL_PROVIDER_SORT === 'string' &&
      ['latency', 'throughput', 'price'].includes(
        config.BACKEND_MODEL_PROVIDER_SORT.trim().toLowerCase(),
      )
        ? config.BACKEND_MODEL_PROVIDER_SORT.trim().toLowerCase()
        : 'latency',
    BACKEND_MODEL_REASONING_EFFORT:
      typeof config.BACKEND_MODEL_REASONING_EFFORT === 'string' &&
      ['none', 'minimal', 'low', 'medium', 'high'].includes(
        config.BACKEND_MODEL_REASONING_EFFORT.trim().toLowerCase(),
      )
        ? config.BACKEND_MODEL_REASONING_EFFORT.trim().toLowerCase()
        : 'none',
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
    BACKEND_MEMORY_DREAM_MIN_USER_MESSAGES: parsePositiveInteger(
      config,
      'BACKEND_MEMORY_DREAM_MIN_USER_MESSAGES',
      4,
    ),
    BACKEND_MEMORY_DREAM_MIN_TOKENS: parsePositiveInteger(
      config,
      'BACKEND_MEMORY_DREAM_MIN_TOKENS',
      800,
    ),
    BACKEND_MEMORY_DREAM_IDLE_MS: parsePositiveInteger(
      config,
      'BACKEND_MEMORY_DREAM_IDLE_MS',
      15 * 60 * 1000,
    ),
    BACKEND_MEMORY_DREAM_SHORT_SEGMENT_AGE_MS: parsePositiveInteger(
      config,
      'BACKEND_MEMORY_DREAM_SHORT_SEGMENT_AGE_MS',
      6 * 60 * 60 * 1000,
    ),
    BACKEND_MEMORY_MAX_COSINE_DISTANCE: parseUnitInterval(
      config,
      'BACKEND_MEMORY_MAX_COSINE_DISTANCE',
      0.3,
    ),
    BACKEND_WHATSAPP_GOWA_URL:
      typeof config.BACKEND_WHATSAPP_GOWA_URL === 'string' &&
      config.BACKEND_WHATSAPP_GOWA_URL.trim() !== ''
        ? config.BACKEND_WHATSAPP_GOWA_URL.trim()
        : 'http://127.0.0.1:3001',
    BACKEND_WHATSAPP_GOWA_DEVICE_ID:
      typeof config.BACKEND_WHATSAPP_GOWA_DEVICE_ID === 'string' &&
      config.BACKEND_WHATSAPP_GOWA_DEVICE_ID.trim() !== ''
        ? config.BACKEND_WHATSAPP_GOWA_DEVICE_ID.trim()
        : 'sydia',
    BACKEND_WHATSAPP_WEBHOOK_SECRET:
      typeof config.BACKEND_WHATSAPP_WEBHOOK_SECRET === 'string' &&
      config.BACKEND_WHATSAPP_WEBHOOK_SECRET.trim() !== ''
        ? config.BACKEND_WHATSAPP_WEBHOOK_SECRET.trim()
        : 'dev-secret',
    BACKEND_WHATSAPP_LOCK_PATH:
      typeof config.BACKEND_WHATSAPP_LOCK_PATH === 'string' &&
      config.BACKEND_WHATSAPP_LOCK_PATH.trim() !== ''
        ? config.BACKEND_WHATSAPP_LOCK_PATH.trim()
        : '.data/whatsapp',
    BACKEND_WHATSAPP_COMMAND_TIMEOUT: parsePositiveInteger(
      config,
      'BACKEND_WHATSAPP_COMMAND_TIMEOUT',
      30_000,
    ),
    BACKEND_WHATSAPP_STATUS_POLL_MS: parsePositiveInteger(
      config,
      'BACKEND_WHATSAPP_STATUS_POLL_MS',
      15_000,
    ),
    BACKEND_WHATSAPP_RUNTIME_ENABLED:
      config.BACKEND_WHATSAPP_RUNTIME_ENABLED !== 'false',
    BACKEND_TELEGRAM_BOT_TOKEN:
      typeof config.BACKEND_TELEGRAM_BOT_TOKEN === 'string'
        ? config.BACKEND_TELEGRAM_BOT_TOKEN.trim()
        : '',
    BACKEND_TELEGRAM_BOT_USERNAME:
      typeof config.BACKEND_TELEGRAM_BOT_USERNAME === 'string'
        ? config.BACKEND_TELEGRAM_BOT_USERNAME.trim().replace(/^@/, '')
        : '',
    BACKEND_TELEGRAM_RUNTIME_ENABLED:
      config.BACKEND_TELEGRAM_RUNTIME_ENABLED !== 'false',
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
    SecretsModule,
    MemoriesModule,
    TodayModule,
    CryptoModule,
    StorageModule,
    DocumentsModule,
    ContactsModule,
    CalendarModule,
    AdminModule,
    WhatsAppInfraModule,
    TelegramInfraModule,
    NotificationsModule,
    ObservabilityModule,
    WhatsAppModule,
    TelegramModule,
  ],
  controllers: [AppController],
  providers: [AppService, AllExceptionsFilter, ResponseInterceptor],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
