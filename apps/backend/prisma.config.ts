import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// The CLI config reads the same BACKEND_DB_URL the runtime and the seed script
// use, so credentials have a single source of truth.
// Default export is mandated by the Prisma CLI.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'bun run prisma/seed.ts',
  },
  datasource: {
    url: env('BACKEND_DB_URL'),
  },
});
