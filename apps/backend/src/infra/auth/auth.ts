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
 * Returns the shared cookie domain for an HTTPS origin trusted by the backend.
 *
 * A domain cookie is only safe here when both hosts are valid DNS names,
 * differ from one another, and have a common suffix with at least two labels.
 * Invalid, local, IP-based, and non-HTTPS URLs intentionally remain host-only.
 */
export function getSharedCookieDomain(
  frontendURLs: string[],
  backendURL: string,
): string | undefined {
  let backend: URL;

  try {
    backend = new URL(backendURL);
  } catch {
    return undefined;
  }

  return frontendURLs
    .map((frontendURL) => sharedCookieDomain(frontendURL, backend))
    .find((domain) => domain !== undefined);
}

function sharedCookieDomain(
  frontendURL: string,
  backend: URL,
): string | undefined {
  let frontend: URL;

  try {
    frontend = new URL(frontendURL);
  } catch {
    return undefined;
  }

  if (frontend.protocol !== 'https:' || backend.protocol !== 'https:') {
    return undefined;
  }

  const frontendHostname = frontend.hostname.toLowerCase().replace(/\.$/, '');
  const backendHostname = backend.hostname.toLowerCase().replace(/\.$/, '');

  if (
    frontendHostname === backendHostname ||
    !isDnsHostname(frontendHostname) ||
    !isDnsHostname(backendHostname)
  ) {
    return undefined;
  }

  const frontendLabels = frontendHostname.split('.');
  const backendLabels = backendHostname.split('.');
  const sharedLabels: string[] = [];

  while (
    sharedLabels.length < frontendLabels.length &&
    sharedLabels.length < backendLabels.length
  ) {
    const frontendLabel =
      frontendLabels[frontendLabels.length - sharedLabels.length - 1];

    const backendLabel =
      backendLabels[backendLabels.length - sharedLabels.length - 1];

    if (!frontendLabel || !backendLabel || frontendLabel !== backendLabel) {
      break;
    }

    sharedLabels.unshift(frontendLabel);
  }

  return sharedLabels.length >= 2 ? sharedLabels.join('.') : undefined;
}

function isDnsHostname(hostname: string): boolean {
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.includes(':') ||
    hostname.length > 253
  ) {
    return false;
  }

  const labels = hostname.split('.');

  return (
    labels.length >= 2 &&
    !labels.every((label) => /^\d+$/.test(label)) &&
    labels.every(
      (label) =>
        label.length >= 1 &&
        label.length <= 63 &&
        /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label),
    )
  );
}

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

  const sharedCookieDomain = getSharedCookieDomain(
    options.trustedOrigins,
    options.baseURL,
  );

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
    ...(sharedCookieDomain
      ? {
          advanced: {
            crossSubDomainCookies: {
              enabled: true,
              domain: sharedCookieDomain,
            },
          },
        }
      : {}),
  }) as unknown as Auth;
}
