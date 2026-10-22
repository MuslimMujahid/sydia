import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { z } from 'zod';
import type { AuthSecurity } from './auth-security.service';
import { hashAuthOTP } from './registration-policy';

const invalidCode = () =>
  new APIError('BAD_REQUEST', {
    code: 'INVALID_OTP',
    message: 'Kode belum cocok. Periksa kode atau minta kode baru.',
  });

const proofIdentifier = (token: string) =>
  `sydia-password-reset:${createHash('sha256').update(token).digest('hex')}`;

const recoveryProof = z.object({ userId: z.string(), email: z.email() });

export function passwordRecoveryPlugin(secret: string, security: AuthSecurity) {
  return {
    id: 'sydia-password-recovery',
    endpoints: {
      verifyRecoveryCode: createAuthEndpoint(
        '/recovery/verify-code',
        {
          method: 'POST',
          body: z.object({
            email: z.email().transform((value) => value.toLowerCase()),
            otp: z.string().regex(/^\d{6}$/),
          }),
        },
        async (ctx) => {
          const { email, otp } = ctx.body;
          await security.limitGuess(email);
          await security.consumeOTP(
            `otp:forget-password:${email}`,
            await hashAuthOTP(secret, otp),
          );
          const identifier = `forget-password-otp-${email}`;
          const challenge =
            await ctx.context.internalAdapter.consumeVerificationValue(
              identifier,
            );

          if (!challenge) throw invalidCode();
          const separator = challenge.value.lastIndexOf(':');
          const hash = challenge.value.slice(0, separator);
          const attempts = Number(challenge.value.slice(separator + 1));
          if (!Number.isInteger(attempts) || attempts >= 5)
            throw new APIError('FORBIDDEN', {
              code: 'TOO_MANY_ATTEMPTS',
              message: 'Batas percobaan tercapai. Minta kode baru.',
            });
          const candidate = await hashAuthOTP(secret, otp);

          if (
            hash.length !== candidate.length ||
            !timingSafeEqual(Buffer.from(hash), Buffer.from(candidate))
          ) {
            if (attempts < 4)
              await ctx.context.internalAdapter.createVerificationValue({
                ...challenge,
                id: undefined,
                value: `${hash}:${attempts + 1}`,
              });
            throw attempts === 4
              ? new APIError('FORBIDDEN', {
                  code: 'TOO_MANY_ATTEMPTS',
                  message: 'Batas percobaan tercapai. Minta kode baru.',
                })
              : invalidCode();
          }

          const user = await ctx.context.internalAdapter.findUserByEmail(email);
          if (
            !user ||
            !(await ctx.context.internalAdapter.findCredentialAccount(
              user.user.id,
            ))
          )
            throw invalidCode();
          const token = randomBytes(32).toString('base64url');
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: proofIdentifier(token),
            value: JSON.stringify({ userId: user.user.id, email }),
            expiresAt: new Date(Date.now() + 600_000),
          });

          // Only returned to the submitting browser; never URL or persistent storage.
          return ctx.json({ token });
        },
      ),
      finishRecovery: createAuthEndpoint(
        '/recovery/reset-password',
        {
          method: 'POST',
          body: z.object({
            token: z.string().min(32).max(128),
            password: z.string().min(8).max(128),
          }),
        },
        async (ctx) => {
          const proof =
            await ctx.context.internalAdapter.consumeVerificationValue(
              proofIdentifier(ctx.body.token),
            );

          if (!proof)
            throw new APIError('BAD_REQUEST', {
              code: 'RECOVERY_EXPIRED',
              message: 'Sesi pemulihan berakhir. Minta kode baru.',
            });
          const identity = recoveryProof.parse(
            JSON.parse(proof.value) as unknown,
          );

          const current = await ctx.context.internalAdapter.findUserByEmail(
            identity.email,
          );

          if (!current || current.user.id !== identity.userId) {
            ctx.context.logger.warn(
              'Password recovery rejected because the account email changed.',
            );
            throw new APIError('BAD_REQUEST', {
              code: 'RECOVERY_EXPIRED',
              message: 'Sesi pemulihan berakhir. Minta kode baru.',
            });
          }

          await ctx.context.internalAdapter.updatePassword(
            identity.userId,
            await ctx.context.password.hash(ctx.body.password),
          );
          await ctx.context.internalAdapter.updateUser(identity.userId, {
            emailVerified: true,
          });
          await ctx.context.internalAdapter.deleteUserSessions(identity.userId);
          ctx.context.logger.info(
            'Password recovery completed and previous sessions revoked.',
          );

          return ctx.json({ success: true });
        },
      ),
    },
  };
}
