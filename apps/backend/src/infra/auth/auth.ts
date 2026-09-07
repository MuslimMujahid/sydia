import { betterAuth, type Auth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin } from 'better-auth/plugins';
import type { CreateAuditEvent } from '../../database/entities';
import type { IAuditEventRepository } from '../../database/interfaces';
import type { PrismaService } from '../prisma';

export type AuthOptions = {
  /** Session-signing secret (BACKEND_AUTH_SECRET). */
  secret: string;
  /** Public base URL of this server (BACKEND_AUTH_URL). */
  baseURL: string;
  /** Origins allowed to call auth endpoints with credentials. */
  trustedOrigins: string[];
  /** Durable sink for identity lifecycle audit events. */
  auditEventRepository: Pick<IAuditEventRepository, 'record'>;
  provisionDefaultCategories: (userId: string) => Promise<void>;
};

/**
 * Builds the Better Auth instance. Better Auth owns the identity tables
 * (user/session/account/verification) through the Prisma adapter; application
 * code never writes them directly.
 * The return type is intentionally inferred: Better Auth's `Auth<O>` is
 * invariant in its options, so the concrete instance type flows into
 * `@thallesp/nestjs-better-auth`'s generic `AuthModuleOptions<A>`.
 */
export function createAuth(prisma: PrismaService, options: AuthOptions): Auth {
  const recordAuditEvent = async (
    eventType: string,
    userId: string | undefined,
  ): Promise<void> => {
    const event: CreateAuditEvent = {
      userId,
      eventType,
      metadata: {},
    };

    await options.auditEventRepository.record(event);
  };

  return betterAuth({
    database: prismaAdapter(prisma, {
      provider: 'postgresql',
      // Sign-up wraps user, account, and session creation in a transaction.
      // Better Auth runs create.after hooks after that transaction commits;
      // without this flag the adapter exposes no transaction implementation,
      // so the sign-up endpoint fails before creating a valid identity.
      transaction: true,
    }),
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await options.provisionDefaultCategories(user.id);
            await recordAuditEvent('account.created', user.id);
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            await recordAuditEvent('session.created', session.userId);
          },
        },
        delete: {
          after: async (session) => {
            await recordAuditEvent('session.deleted', session.userId);
          },
        },
      },
    },
    plugins: [
      admin({
        bannedUserMessage: 'Akun Anda telah dinonaktifkan oleh administrator.',
      }),
    ],
    emailAndPassword: {
      enabled: true,
    },
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: options.trustedOrigins,
  }) as unknown as Auth;
}
