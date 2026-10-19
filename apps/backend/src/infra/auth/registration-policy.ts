import { createHmac } from 'node:crypto';
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from 'better-auth/api';
import type { AuthSecurity } from './auth-security.service';

const PENDING_PATHS = new Set([
  '/registration/methods',
  '/registration/confirm-password',
  '/registration/google/confirm',
  '/registration/google/callback',
  '/recovery/verify-code',
  '/recovery/reset-password',
  '/get-session',
  '/sign-out',
  '/list-accounts',
  '/email-otp/send-verification-otp',
  '/email-otp/verify-email',
  '/email-otp/request-email-change',
  '/email-otp/change-email',
  '/verify-password',
  '/sign-in/social',
]);

const DISABLED_PATHS = new Set([
  '/request-password-reset',
  '/reset-password',
  '/email-otp/reset-password',
  '/sign-in/email-otp',
  '/email-otp/check-verification-otp',
  '/change-email',
  '/unlink-account',
  '/set-password',
  '/verify-email',
  '/send-verification-email',
  '/forget-password/email-otp',
]);

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || !value)
    throw new APIError('BAD_REQUEST', {
      code: 'INVALID_INPUT',
      message: 'Lengkapi data yang diperlukan.',
    });

  return value;
}

export function registrationPolicy(security: AuthSecurity, secret: string) {
  return {
    before: createAuthMiddleware(async (ctx) => {
      if (DISABLED_PATHS.has(ctx.path))
        throw new APIError('FORBIDDEN', {
          code: 'AUTH_METHOD_DISABLED',
          message: 'Gunakan metode masuk yang tersedia.',
        });
      const body = record(ctx.body as unknown);
      const session = await getSessionFromCtx(ctx);

      if (ctx.path === '/sign-in/social' || ctx.path === '/link-social') {
        if (
          body.provider !== 'google' ||
          body.scopes ||
          body.idToken ||
          body.additionalParams
        ) {
          ctx.context.logger.warn(
            'Unsupported Google identity authorization parameters rejected.',
          );
          throw new APIError('BAD_REQUEST', {
            code: 'INVALID_AUTH_REQUEST',
            message: 'Gunakan tombol Google untuk melanjutkan.',
          });
        }

        if (
          ctx.path === '/link-social' &&
          (!session || !(await security.get(`proof:${session.session.id}`)))
        ) {
          throw new APIError('UNAUTHORIZED', {
            code: 'FRESH_AUTH_REQUIRED',
            message: 'Konfirmasi akun Anda sebelum menghubungkan Google.',
          });
        }
      }

      if (
        session &&
        !session.user.emailVerified &&
        !PENDING_PATHS.has(ctx.path) &&
        !ctx.path.startsWith('/callback/') &&
        ![
          '/sign-in/email',
          '/sign-up/email',
          '/email-otp/request-password-reset',
          '/email-otp/reset-password',
        ].includes(ctx.path)
      ) {
        throw new APIError('FORBIDDEN', {
          code: 'EMAIL_VERIFICATION_REQUIRED',
          message: 'Verifikasi email Anda sebelum melanjutkan.',
        });
      }

      if (
        ctx.path === '/email-otp/send-verification-otp' ||
        ctx.path === '/email-otp/verify-email'
      ) {
        if (!session)
          throw new APIError('UNAUTHORIZED', {
            code: 'SESSION_REQUIRED',
            message: 'Masuk kembali untuk memverifikasi email.',
          });
        const email = requiredString(body, 'email').toLowerCase();
        if (
          email !== session.user.email.toLowerCase() ||
          (ctx.path.endsWith('send-verification-otp') &&
            body.type !== 'email-verification')
        )
          throw new APIError('FORBIDDEN', {
            code: 'CHALLENGE_MISMATCH',
            message: 'Kode ini tidak sesuai dengan akun Anda.',
          });

        if (ctx.path.endsWith('verify-email')) {
          // A stale pending browser cannot activate an unproven password.
          if (!(await security.get(`proof:${session.session.id}`)))
            throw new APIError('UNAUTHORIZED', {
              code: 'FRESH_AUTH_REQUIRED',
              message: 'Masuk kembali sebelum memverifikasi email.',
            });
          if (
            (await security.get(`verification:${email}`)) !== session.session.id
          )
            throw new APIError('FORBIDDEN', {
              code: 'CHALLENGE_MISMATCH',
              message: 'Minta kode baru dari halaman ini.',
            });
          await security.limitGuess(email);
          await security.consumeOTP(
            `otp:email-verification:${email}`,
            await hashAuthOTP(secret, requiredString(body, 'otp')),
          );
        } else {
          await security.limitSend(email);
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(
            `email-verification-otp-${email}`,
          );
          await security.set(`verification:${email}`, session.session.id, 600);
        }
      }

      if (
        ctx.path === '/email-otp/request-password-reset' ||
        ctx.path === '/email-otp/reset-password'
      ) {
        const email = requiredString(body, 'email').toLowerCase();
        if (ctx.path.endsWith('request-password-reset')) {
          await security.limitSend(email);
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(
            `forget-password-otp-${email}`,
          );
        } else await security.limitGuess(email);
        const user = await ctx.context.internalAdapter.findUserByEmail(email);
        if (
          user &&
          !(await ctx.context.internalAdapter.findCredentialAccount(
            user.user.id,
          ))
        )
          throw new APIError('BAD_REQUEST', {
            code: 'RECOVERY_UNAVAILABLE',
            message: 'Gunakan akun Google yang terhubung untuk masuk.',
          });
      }

      if (
        ctx.path === '/email-otp/request-email-change' ||
        ctx.path === '/email-otp/change-email'
      ) {
        if (!session)
          throw new APIError('UNAUTHORIZED', {
            code: 'SESSION_REQUIRED',
            message: 'Masuk untuk mengubah email.',
          });
        const newEmail = requiredString(body, 'newEmail').toLowerCase();
        const proofKey = `change-email:${session.session.id}`;
        const currentTarget = await security.get(proofKey);

        if (ctx.path.endsWith('request-email-change')) {
          if (currentTarget !== newEmail) {
            const googleProof =
              (await security.get(`proof:${session.session.id}`)) === 'google';

            const password = googleProof
              ? undefined
              : requiredString(body, 'currentPassword');

            if (!googleProof)
              await security.limitGuess(session.user.email.toLowerCase());

            const credential =
              await ctx.context.internalAdapter.findCredentialAccount(
                session.user.id,
              );

            if (
              !googleProof &&
              (!credential?.password ||
                !password ||
                !(await ctx.context.password.verify({
                  hash: credential.password,
                  password,
                })))
            )
              throw new APIError('UNAUTHORIZED', {
                code: 'IDENTITY_REJECTED',
                message: 'Kata sandi saat ini tidak sesuai. Coba lagi.',
              });
            if (currentTarget)
              await ctx.context.internalAdapter.deleteVerificationByIdentifier(
                `change-email-otp-${session.user.email.toLowerCase()}-${currentTarget}`,
              );
          }

          if (await ctx.context.internalAdapter.findUserByEmail(newEmail))
            throw new APIError('CONFLICT', {
              code: 'EMAIL_ALREADY_IN_USE',
              message: 'Email sudah digunakan. Pilih alamat lain.',
            });
          await security.limitSend(newEmail);
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(
            `change-email-otp-${session.user.email.toLowerCase()}-${newEmail}`,
          );
          await security.set(proofKey, newEmail, 600);
        } else {
          if (currentTarget !== newEmail)
            throw new APIError('UNAUTHORIZED', {
              code: 'FRESH_AUTH_REQUIRED',
              message: 'Konfirmasi akun Anda kembali.',
            });
          await security.limitGuess(newEmail);
          await security.consumeOTP(
            `otp:change-email:${newEmail}`,
            await hashAuthOTP(secret, requiredString(body, 'otp')),
          );
        }
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      const googleCallback =
        ctx.path === '/callback/google' ||
        (ctx.path === '/callback/:id' && ctx.params?.id === 'google');

      if (
        (['/sign-up/email', '/sign-in/email'].includes(ctx.path) ||
          googleCallback) &&
        ctx.context.newSession
      ) {
        await security.set(
          `proof:${ctx.context.newSession.session.id}`,
          googleCallback ? 'google' : 'password',
          600,
        );
      }

      if (
        ctx.path === '/email-otp/change-email' &&
        ctx.context.session &&
        !(ctx.context.returned instanceof APIError)
      ) {
        await security.delete(`change-email:${ctx.context.session.session.id}`);
      }
    }),
  };
}

export function hashAuthOTP(secret: string, otp: string): Promise<string> {
  return Promise.resolve(
    createHmac('sha256', secret).update(`email-otp:${otp}`).digest('base64url'),
  );
}
