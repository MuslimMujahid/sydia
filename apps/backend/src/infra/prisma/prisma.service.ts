import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../../generated/prisma/client';

/**
 * Single Prisma client for the whole application.
 *
 * Prisma 7 has no built-in engine: every query goes through the driver
 * adapter, which owns the `pg` connection pool. `$disconnect()` disposes the
 * adapter (and ends the pool), so the pool is never ended manually.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    const pool = new Pool({
      connectionString: config.getOrThrow<string>('BACKEND_DB_URL'),
    });

    super({ adapter: new PrismaPg(pool) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
