import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// The CLI config composes the connection URL from the same BACKEND_DB_* parts
// the runtime uses, so there is a single source of truth for credentials.
const databaseUrl = `postgresql://${encodeURIComponent(env('BACKEND_DB_USER'))}:${encodeURIComponent(env('BACKEND_DB_PASSWORD'))}@${env('BACKEND_DB_HOST')}:${process.env.BACKEND_DB_PORT ?? '5432'}/${env('BACKEND_DB_NAME')}`;

// Default export is mandated by the Prisma CLI.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
