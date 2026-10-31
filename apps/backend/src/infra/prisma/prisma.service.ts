import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient, type Prisma } from '../../generated/prisma/client';

/**
 * Single Prisma client for the whole application.
 *
 * Prisma 7 has no built-in engine: every query goes through the driver
 * adapter, which owns the `pg` connection pool. `$disconnect()` disposes the
 * adapter (and ends the pool), so the pool is never ended manually.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly databaseRoot: Prisma.TransactionClient;
  private readonly transactionScope =
    new AsyncLocalStorage<Prisma.TransactionClient>();

  /** Repositories participating in a composed commit share this connection. */
  get client(): Prisma.TransactionClient {
    return this.transactionScope.getStore() ?? this.databaseRoot;
  }

  async inTransaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const active = this.transactionScope.getStore();
    if (active) return work(active);

    return this.$transaction(
      (tx) => this.transactionScope.run(tx, () => work(tx)),
      { timeout: 30_000 },
    );
  }

  constructor(config: ConfigService) {
    const pool = new Pool({
      connectionString: config.getOrThrow<string>('BACKEND_DB_URL'),
    });

    super({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
    this.databaseRoot = this;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
