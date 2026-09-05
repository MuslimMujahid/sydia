import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { PrismaService } from '../prisma';

export type AuthOptions = {
  /** Session-signing secret (BACKEND_AUTH_SECRET). */
  secret: string;
  /** Public base URL of this server (BACKEND_AUTH_URL). */
  baseURL: string;
  /** Origins allowed to call auth endpoints with credentials. */
  trustedOrigins: string[];
};

/**
 * Builds the Better Auth instance. Better Auth owns the identity tables
 * (user/session/account/verification) through the Prisma adapter; application
 * code never writes them directly.
 * The return type is intentionally inferred: Better Auth's `Auth<O>` is
 * invariant in its options, so the concrete instance type flows into
 * `@thallesp/nestjs-better-auth`'s generic `AuthModuleOptions<A>`.
 */
export function createAuth(prisma: PrismaService, options: AuthOptions) {
  return betterAuth({
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
    },
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: options.trustedOrigins,
  });
}
