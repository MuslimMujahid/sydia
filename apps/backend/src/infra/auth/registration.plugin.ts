import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import {
  APIError,
  createAuthEndpoint,
  getSessionFromCtx,
} from 'better-auth/api';
import { z } from 'zod';
import type { AuthSecurity } from './auth-security.service';

type GoogleIdentity = { clientId: string; clientSecret: string };
const proofLifetime = 600;
const reauthentication = z.object({
  userId: z.string(),
  sessionId: z.string(),
  browserNonce: z.string(),
  idNonce: z.string(),
  verifier: z.string(),
});

export function registrationPlugin(
  security: AuthSecurity,
  baseURL: string,
  frontendURL: string,
  google?: GoogleIdentity,
) {
  const redirectUri = new URL('/api/auth/registration/google/callback', baseURL)
    .href;

  const client = google
    ? new OAuth2Client({ ...google, redirectUri })
    : undefined;

  return {
    id: 'sydia-registration',
    endpoints: {
      registrationMethods: createAuthEndpoint(
        '/registration/methods',
        { method: 'GET' },
        async (ctx) => {
          const session = await getSessionFromCtx(ctx);
          if (!session)
            throw new APIError('UNAUTHORIZED', {
              code: 'SESSION_REQUIRED',
              message: 'Masuk kembali untuk melanjutkan.',
            });
          const accounts = await ctx.context.internalAdapter.findAccounts(
            session.user.id,
          );

          const googleAccount = accounts.find(
            (account) => account.providerId === 'google',
          );

          let googleEmail: string | null = null;

          if (googleAccount) {
            try {
              // These claims were validated by the OAuth provider before Better
              // Auth stored the ID token. Read display metadata without a live
              // provider request; never substitute the Sydia account's email.
              const segment = googleAccount.idToken?.split('.')[1];
              if (!segment)
                throw new Error('Stored Google identity has no display claims');
              const claims = z
                .object({ sub: z.string(), email: z.email() })
                .parse(
                  JSON.parse(
                    Buffer.from(segment, 'base64url').toString('utf8'),
                  ) as unknown,
                );

              if (claims.sub !== googleAccount.accountId)
                throw new Error(
                  'Stored Google identity display binding mismatch',
                );
              googleEmail = claims.email;
            } catch {
              ctx.context.logger.warn(
                'Google identity display metadata is unavailable; a new Google sign-in is required to restore it.',
              );
            }
          }

          const proof = await security.get(`proof:${session.session.id}`);

          return ctx.json({
            password: accounts.some(
              (account) =>
                account.providerId === 'credential' &&
                Boolean(account.password),
            ),
            google: accounts.some((account) => account.providerId === 'google'),
            googleEmail,
            confirmed: Boolean(proof),
            confirmationMethod:
              proof === 'google'
                ? 'google'
                : proof === 'password'
                  ? 'password'
                  : null,
          });
        },
      ),
      confirmRegistrationPassword: createAuthEndpoint(
        '/registration/confirm-password',
        {
          method: 'POST',
          body: z.object({ password: z.string().min(1).max(128) }),
        },
        async (ctx) => {
          const session = await getSessionFromCtx(ctx);
          if (!session)
            throw new APIError('UNAUTHORIZED', {
              code: 'SESSION_REQUIRED',
              message: 'Masuk kembali untuk melanjutkan.',
            });
          await security.limitGuess(session.user.email);
          const credential =
            await ctx.context.internalAdapter.findCredentialAccount(
              session.user.id,
            );

          if (
            !credential?.password ||
            !(await ctx.context.password.verify({
              password: ctx.body.password,
              hash: credential.password,
            }))
          ) {
            ctx.context.logger.warn('Account ownership confirmation rejected.');
            throw new APIError('UNAUTHORIZED', {
              code: 'IDENTITY_REJECTED',
              message: 'Kata sandi saat ini tidak sesuai. Coba lagi.',
            });
          }

          await security.set(
            `proof:${session.session.id}`,
            'password',
            proofLifetime,
          );

          return ctx.json({ success: true });
        },
      ),
      beginGoogleReauthentication: createAuthEndpoint(
        '/registration/google/confirm',
        { method: 'POST' },
        async (ctx) => {
          const session = await getSessionFromCtx(ctx);
          if (!session)
            throw new APIError('UNAUTHORIZED', {
              code: 'SESSION_REQUIRED',
              message: 'Masuk kembali untuk melanjutkan.',
            });
          if (!client)
            throw new APIError('SERVICE_UNAVAILABLE', {
              code: 'GOOGLE_UNAVAILABLE',
              message: 'Google belum tersedia. Gunakan kata sandi Anda.',
            });
          const accounts = await ctx.context.internalAdapter.findAccounts(
            session.user.id,
          );

          if (!accounts.some((account) => account.providerId === 'google'))
            throw new APIError('FORBIDDEN', {
              code: 'IDENTITY_REJECTED',
              message: 'Gunakan metode masuk yang sudah terhubung.',
            });
          const state = randomBytes(32).toString('base64url');
          const browserNonce = randomBytes(32).toString('base64url');
          const idNonce = randomBytes(32).toString('base64url');
          const verifier = randomBytes(32).toString('base64url');
          await security.set(
            `google-confirm:${state}`,
            JSON.stringify({
              userId: session.user.id,
              sessionId: session.session.id,
              browserNonce,
              idNonce,
              verifier,
            }),
            proofLifetime,
          );
          const cookie = ctx.context.createAuthCookie('google_confirmation', {
            maxAge: proofLifetime,
          });

          await ctx.setSignedCookie(
            cookie.name,
            browserNonce,
            ctx.context.secret,
            cookie.attributes,
          );

          return ctx.json({
            url: client.generateAuthUrl({
              scope: ['openid', 'email', 'profile'],
              prompt: 'select_account',
              state,
              nonce: idNonce,
              code_challenge_method: CodeChallengeMethod.S256,
              code_challenge: createHash('sha256')
                .update(verifier)
                .digest('base64url'),
            }),
          });
        },
      ),
      completeGoogleReauthentication: createAuthEndpoint(
        '/registration/google/callback',
        {
          method: 'GET',
          query: z.object({
            state: z.string().optional(),
            code: z.string().optional(),
            error: z.string().optional(),
          }),
        },
        async (ctx) => {
          const destination = new URL('/change-email', frontendURL);
          const cookie = ctx.context.createAuthCookie('google_confirmation', {
            maxAge: proofLifetime,
          });

          const nonce = await ctx.getSignedCookie(
            cookie.name,
            ctx.context.secret,
          );

          ctx.setCookie(cookie.name, '', { ...cookie.attributes, maxAge: 0 });

          try {
            const raw = ctx.query.state
              ? await security.consume(`google-confirm:${ctx.query.state}`)
              : null;

            const session = await getSessionFromCtx(ctx);
            if (
              !raw ||
              !session ||
              !client ||
              !ctx.query.code ||
              ctx.query.error ||
              !nonce
            )
              throw new Error('Missing Google confirmation context');
            const request = reauthentication.parse(JSON.parse(raw) as unknown);
            const left = Buffer.from(request.browserNonce),
              right = Buffer.from(nonce);

            if (
              request.userId !== session.user.id ||
              request.sessionId !== session.session.id ||
              left.length !== right.length ||
              !timingSafeEqual(left, right)
            )
              throw new Error('Google confirmation context mismatch');
            const { tokens } = await client.getToken({
              code: ctx.query.code,
              codeVerifier: request.verifier,
            });

            if (!tokens.id_token)
              throw new Error('Google confirmation omitted identity token');
            const identity = (
              await client.verifyIdToken({
                idToken: tokens.id_token,
                audience: google?.clientId,
              })
            ).getPayload();

            const claims: unknown = identity;
            if (
              !claims ||
              typeof claims !== 'object' ||
              !('nonce' in claims) ||
              claims.nonce !== request.idNonce ||
              !identity?.sub
            )
              throw new Error('Google confirmation identity invalid');
            const accounts = await ctx.context.internalAdapter.findAccounts(
              session.user.id,
            );

            if (
              !accounts.some(
                (account) =>
                  account.providerId === 'google' &&
                  account.accountId === identity.sub,
              )
            )
              throw new Error('Google confirmation used a different identity');
            await security.set(
              `proof:${session.session.id}`,
              'google',
              proofLifetime,
            );
            destination.searchParams.set('confirmation', 'complete');
          } catch {
            ctx.context.logger.warn(
              'Google ownership confirmation failed; account and email were preserved.',
            );
            destination.searchParams.set('confirmation', 'failed');
          }

          throw ctx.redirect(destination.href);
        },
      ),
    },
  };
}
