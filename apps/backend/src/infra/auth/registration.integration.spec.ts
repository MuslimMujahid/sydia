import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { APIError } from 'better-auth/api';
import {
  LoginTicket,
  OAuth2Client,
  type GetTokenOptions,
  type VerifyIdTokenOptions,
} from 'google-auth-library';
import { createAuth } from './auth';
import type { PrismaService } from '../prisma';
import type { AuthMail } from './auth-mail.service';
import type { AuthSecurity } from './auth-security.service';

afterEach(() => {
  jest.restoreAllMocks();
});

// Exercise real Better Auth endpoints and its adapter. The external protection
// store is isolated here; Redis quotas are covered separately at the Redis boundary.
function harness() {
  const store: Record<string, Record<string, unknown>[]> = {
    user: [],
    session: [],
    account: [],
    verification: [],
  };

  const mail: AuthMail[] = [];
  const guesses: string[] = [];
  const proofs = new Map<string, string>();
  const security: AuthSecurity = {
    limitSend: () => Promise.resolve(),
    limitGuess: (email) => {
      guesses.push(email);

      return Promise.resolve();
    },
    get: (key) => Promise.resolve(proofs.get(key) ?? null),
    consume: (key) => {
      const value = proofs.get(key) ?? null;
      proofs.delete(key);

      return Promise.resolve(value);
    },
    consumeOTP: (key, candidateHash) => {
      const value = proofs.get(key);
      if (!value)
        return Promise.reject(
          new APIError('BAD_REQUEST', {
            code: 'OTP_EXPIRED',
            message: 'Minta kode baru.',
          }),
        );
      const [hash, attemptsText] = value.split(':');
      const attempts = Number(attemptsText);
      if (attempts >= 5)
        return Promise.reject(
          new APIError('FORBIDDEN', {
            code: 'TOO_MANY_ATTEMPTS',
            message: 'Minta kode baru.',
          }),
        );

      if (hash !== candidateHash) {
        proofs.set(key, `${hash}:${attempts + 1}`);

        return Promise.reject(
          new APIError(attempts === 4 ? 'FORBIDDEN' : 'BAD_REQUEST', {
            code: attempts === 4 ? 'TOO_MANY_ATTEMPTS' : 'INVALID_OTP',
            message: 'Kode ditolak.',
          }),
        );
      }

      proofs.delete(key);

      return Promise.resolve();
    },
    set: (key, value) => {
      proofs.set(key, value);

      return Promise.resolve();
    },
    delete: (key) => {
      proofs.delete(key);

      return Promise.resolve();
    },
  };

  const codes = ['111111', '222222', '333333', '444444', '555555'];
  const base = createAuth({} as PrismaService, {
    secret: 'test-auth-secret-long-enough-for-integration-contracts',
    baseURL: 'http://localhost:5000',
    trustedOrigins: ['http://localhost:3000'],
    sendAuthMail: (message) => {
      mail.push(message);

      return Promise.resolve();
    },
    security,
    generateOTP: () => {
      const code = codes.shift();
      if (!code) throw new Error('Test OTP fixture exhausted');

      return code;
    },
    auditEventRepository: { record: () => Promise.resolve() },
    provisionDefaultCategories: () => Promise.resolve(),
    googleIdentity: {
      clientId: 'identity-client.apps.googleusercontent.com',
      clientSecret: 'test-only',
    },
  });

  const auth = betterAuth({
    ...base.options,
    database: memoryAdapter(store),
    rateLimit: { enabled: false },
  });

  const request = (
    path: string,
    body?: Record<string, unknown>,
    cookie?: string,
  ) =>
    auth.handler(
      new Request(`http://localhost:5000/api/auth${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
          ...(cookie ? { cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );

  const register = async (email = 'owner@example.com') => {
    const response = await request('/sign-up/email', {
      name: 'Account Owner',
      email,
      password: 'Original123!',
    });

    expect(response.status).toBe(200);
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');

    return { cookie, email };
  };

  const send = async (account: { cookie: string; email: string }) => {
    const response = await request(
      '/email-otp/send-verification-otp',
      { email: account.email, type: 'email-verification' },
      account.cookie,
    );

    expect(response.status).toBe(200);
  };

  // Replace only Google's remote token/profile boundary. Better Auth's state,
  // cookies, account collision checks, linking, and session hooks remain real.
  const googleFlow = async (
    email: string,
    emailVerified: boolean,
    account?: { cookie: string },
  ) => {
    const context = await auth.$context;
    const provider = context.socialProviders.find(
      (item) => item.id === 'google',
    );

    if (!provider) throw new Error('Google provider fixture is missing');
    provider.validateAuthorizationCode = () =>
      Promise.resolve({
        accessToken: 'external-provider-token',
        scopes: ['openid', 'email', 'profile'],
      });
    provider.getUserInfo = () =>
      Promise.resolve({
        user: { name: 'Google Owner', email, emailVerified },
        data: { sub: 'google-owner', email, email_verified: emailVerified },
      });
    const start = await request(
      account ? '/link-social' : '/sign-in/social',
      {
        provider: 'google',
        callbackURL: 'http://localhost:3000/sign-in',
        errorCallbackURL: 'http://localhost:3000/google-result',
        disableRedirect: true,
      },
      account?.cookie,
    );

    expect(start.status).toBe(200);
    const payload = (await start.json()) as { url: string };
    const state = new URL(payload.url).searchParams.get('state');
    if (!state) throw new Error('Google authorization omitted state');
    const cookie = [
      account?.cookie,
      ...start.headers.getSetCookie().map((value) => value.split(';')[0]),
    ]
      .filter(Boolean)
      .join('; ');

    return request(
      `/callback/google?state=${encodeURIComponent(state)}&code=external-code`,
      undefined,
      cookie,
    );
  };

  return { request, register, send, mail, store, proofs, googleFlow, guesses };
}

async function rejectFiveCodes(
  h: ReturnType<typeof harness>,
  account: { cookie: string; email: string },
) {
  for (let i = 0; i < 5; i++) {
    const result = await h.request(
      '/email-otp/verify-email',
      { email: account.email, otp: '999999' },
      account.cookie,
    );

    expect(result.status).toBe(i === 4 ? 403 : 400);
  }
}

async function googleConfirmationBrowser(h: ReturnType<typeof harness>) {
  const signedIn = await h.googleFlow('owner@gmail.com', true);
  expect(signedIn.status).toBe(302);
  const sessionCookie = signedIn.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');

  // A fresh confirmation must establish its own proof, independently of login.
  h.proofs.clear();
  const started = await h.request(
    '/registration/google/confirm',
    {},
    sessionCookie,
  );

  expect(started.status).toBe(200);
  const payload = (await started.json()) as { url: string };
  const url = new URL(payload.url);
  const state = url.searchParams.get('state');
  const nonce = url.searchParams.get('nonce');
  if (!state || !nonce) throw new Error('Google confirmation omitted binding');
  const confirmationCookie = started.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');

  const browserCookie = [sessionCookie, confirmationCookie].join('; ');

  return {
    sessionCookie,
    confirmationCookie,
    browserCookie,
    nonce,
    callback: `/registration/google/callback?state=${encodeURIComponent(state)}&code=external-code`,
  };
}

function googleConfirmationTokens(nonce: string, subject = 'google-owner') {
  // Select the Promise overloads used by the callback; the library also exposes
  // callback overloads returning void, which Jest otherwise infers here.
  const exchange = jest.spyOn(
    OAuth2Client.prototype,
    'getToken',
  ) as unknown as jest.SpiedFunction<
    (
      options: GetTokenOptions,
    ) => Promise<{ tokens: { id_token: string }; res: null }>
  >;

  exchange.mockResolvedValue({
    tokens: { id_token: 'remote-id-token' },
    res: null,
  });
  const verify = jest.spyOn(
    OAuth2Client.prototype,
    'verifyIdToken',
  ) as unknown as jest.SpiedFunction<
    (options: VerifyIdTokenOptions) => Promise<LoginTicket>
  >;

  verify.mockResolvedValue(
    new LoginTicket('', {
      iss: 'https://accounts.google.com',
      aud: 'identity-client.apps.googleusercontent.com',
      sub: subject,
      iat: 1_000_000,
      exp: 2_000_000,
      nonce,
    }),
  );

  return { exchange, verify };
}

describe('registration endpoint contracts', () => {
  it('counts a rejected email-correction password against the current mailbox guessing budget', async () => {
    const h = harness();
    const account = await h.register();

    const response = await h.request(
      '/email-otp/request-email-change',
      { newEmail: 'replacement@example.com', currentPassword: 'Wrong123!' },
      account.cookie,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'IDENTITY_REJECTED' });
    expect(h.guesses).toEqual(['owner@example.com']);
    expect(h.mail).toEqual([]);
  });

  it('registers a verified Google identity without creating a password account', async () => {
    const h = harness();
    const result = await h.googleFlow('google@example.com', true);
    expect(result.status).toBe(302);
    expect(h.store.user).toHaveLength(1);
    expect(h.store.user![0]).toMatchObject({
      email: 'google@example.com',
      emailVerified: true,
    });
    expect(h.store.account).toHaveLength(1);
    expect(h.store.account![0]).toMatchObject({
      providerId: 'google',
      accountId: 'google-owner',
    });
    expect(h.store.session).toHaveLength(1);
  });

  it('requires email verification when the Google identity email is unverified', async () => {
    const h = harness();
    const result = await h.googleFlow('google@example.com', false);
    expect(result.status).toBe(302);
    expect(h.store.user![0]).toMatchObject({ emailVerified: false });
    expect(Array.from(h.proofs.values())).toContain('google');
  });

  it('does not implicitly link Google to an existing verified password identity', async () => {
    const h = harness();
    const account = await h.register();
    await h.send(account);
    await h.request(
      '/email-otp/verify-email',
      { email: account.email, otp: '111111' },
      account.cookie,
    );
    const result = await h.googleFlow(account.email, true);
    expect(result.status).toBe(302);
    expect(result.headers.get('location')).toContain(
      'error=account_not_linked',
    );
    expect(h.store.user).toHaveLength(1);
    expect(h.store.account).toHaveLength(1);
    expect(h.store.account![0]).toMatchObject({ providerId: 'credential' });
  });

  it('explicit Google linking preserves the authenticated identity', async () => {
    const h = harness();
    const account = await h.register();
    await h.send(account);
    await h.request(
      '/email-otp/verify-email',
      { email: account.email, otp: '111111' },
      account.cookie,
    );
    const id = h.store.user![0]!.id;
    const result = await h.googleFlow(account.email, true, account);
    expect(result.status).toBe(302);
    expect(result.headers.get('location')).toBe(
      'http://localhost:3000/sign-in',
    );
    expect(h.store.user).toHaveLength(1);
    expect(h.store.account).toHaveLength(2);
    expect(h.store.account![1]).toMatchObject({
      providerId: 'google',
      userId: id,
    });
  });
  it('creates a pending identity and blocks product identity updates', async () => {
    const h = harness();
    const account = await h.register();
    const result = await h.request(
      '/update-user',
      { name: 'Forbidden change' },
      account.cookie,
    );

    expect(result.status).toBe(403);
    expect(await result.json()).toMatchObject({
      code: 'EMAIL_VERIFICATION_REQUIRED',
    });
    expect(h.store.user![0]).toMatchObject({
      name: 'Account Owner',
      emailVerified: false,
    });
  });

  it('rejects email verification without an authenticated context', async () => {
    const h = harness();
    const account = await h.register();
    await h.send(account);
    const result = await h.request('/email-otp/verify-email', {
      email: account.email,
      otp: '111111',
    });

    expect(result.status).toBe(401);
    expect(h.store.user![0]).toMatchObject({ emailVerified: false });
  });

  it('rejects a verification challenge from another session for the same account', async () => {
    const h = harness();
    const account = await h.register();
    await h.send(account);
    const login = await h.request('/sign-in/email', {
      email: account.email,
      password: 'Original123!',
    });

    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');

    const result = await h.request(
      '/email-otp/verify-email',
      { email: account.email, otp: '111111' },
      cookie,
    );

    expect(result.status).toBe(403);
    expect(await result.json()).toMatchObject({ code: 'CHALLENGE_MISMATCH' });
  });

  it('consumes a valid verification code once', async () => {
    const h = harness();
    const account = await h.register();
    await h.send(account);
    const first = await h.request(
      '/email-otp/verify-email',
      { email: account.email, otp: '111111' },
      account.cookie,
    );

    const replay = await h.request(
      '/email-otp/verify-email',
      { email: account.email, otp: '111111' },
      account.cookie,
    );

    expect(first.status).toBe(200);
    expect(replay.status).toBe(400);
    expect(h.store.user![0]).toMatchObject({ emailVerified: true });
  });

  it('rejects the correct code after five incorrect submissions', async () => {
    const h = harness();
    const account = await h.register();
    await h.send(account);
    await rejectFiveCodes(h, account);
    const result = await h.request(
      '/email-otp/verify-email',
      { email: account.email, otp: '111111' },
      account.cookie,
    );

    expect(result.status).toBe(403);
    expect(await result.json()).toMatchObject({ code: 'TOO_MANY_ATTEMPTS' });
  });

  it('invalidates the previous code when a replacement is sent', async () => {
    const h = harness();
    const account = await h.register();
    await h.send(account);
    await h.send(account);
    const old = await h.request(
      '/email-otp/verify-email',
      { email: account.email, otp: '111111' },
      account.cookie,
    );

    const current = await h.request(
      '/email-otp/verify-email',
      { email: account.email, otp: '222222' },
      account.cookie,
    );

    expect(old.status).toBe(400);
    expect(current.status).toBe(200);
  });

  it('rejects an expired verification code', async () => {
    const h = harness();
    const account = await h.register();
    await h.send(account);
    h.store.verification![0]!.expiresAt = new Date('2000-01-01T00:00:00Z');
    const result = await h.request(
      '/email-otp/verify-email',
      { email: account.email, otp: '111111' },
      account.cookie,
    );

    expect(result.status).toBe(400);
    expect(await result.json()).toMatchObject({ code: 'OTP_EXPIRED' });
  });

  it('requires fresh password proof even when a pending session still exists', async () => {
    const h = harness();
    const account = await h.register();
    await h.send(account);
    h.proofs.clear();
    const result = await h.request(
      '/email-otp/verify-email',
      { email: account.email, otp: '111111' },
      account.cookie,
    );

    expect(result.status).toBe(401);
    expect(await result.json()).toMatchObject({ code: 'FRESH_AUTH_REQUIRED' });
  });

  it('retains the old email when ownership confirmation fails', async () => {
    const h = harness();
    const account = await h.register();
    const result = await h.request(
      '/email-otp/request-email-change',
      { newEmail: 'replacement@example.com', currentPassword: 'Wrong123!' },
      account.cookie,
    );

    expect(result.status).toBe(401);
    expect(h.store.user![0]).toMatchObject({
      email: account.email,
      emailVerified: false,
    });
    expect(h.mail).toHaveLength(0);
  });

  it('preserves the identity while verifying a replacement email', async () => {
    const h = harness();
    const account = await h.register();
    const id = h.store.user![0]!.id;
    const send = await h.request(
      '/email-otp/request-email-change',
      { newEmail: 'replacement@example.com', currentPassword: 'Original123!' },
      account.cookie,
    );

    expect(send.status).toBe(200);
    expect(h.store.user![0]).toMatchObject({ email: account.email });
    const result = await h.request(
      '/email-otp/change-email',
      { newEmail: 'replacement@example.com', otp: '111111' },
      account.cookie,
    );

    expect(result.status).toBe(200);
    expect(h.store.user![0]).toMatchObject({
      id,
      email: 'replacement@example.com',
      emailVerified: true,
    });
  });

  it('does not authorize a different replacement address with the same proof', async () => {
    const h = harness();
    const account = await h.register();
    await h.request(
      '/email-otp/request-email-change',
      { newEmail: 'replacement@example.com', currentPassword: 'Original123!' },
      account.cookie,
    );
    const result = await h.request(
      '/email-otp/change-email',
      { newEmail: 'different@example.com', otp: '111111' },
      account.cookie,
    );

    expect(result.status).toBe(401);
    expect(h.store.user![0]).toMatchObject({ email: account.email });
  });

  it('revokes every previous session when resetting a password', async () => {
    const h = harness();
    const account = await h.register();
    await h.request('/email-otp/request-password-reset', {
      email: account.email,
    });
    const checked = await h.request('/recovery/verify-code', {
      email: account.email,
      otp: '111111',
    });

    const proof = (await checked.json()) as { token: string };
    const result = await h.request('/recovery/reset-password', {
      token: proof.token,
      password: 'Replacement123!',
    });

    expect(result.status).toBe(200);
    expect(h.store.session).toHaveLength(0);
    expect(h.store.user![0]).toMatchObject({ emailVerified: true });
    const login = await h.request('/sign-in/email', {
      email: account.email,
      password: 'Replacement123!',
    });

    expect(login.status).toBe(200);
  });

  it('rejects replay of a completed password recovery proof', async () => {
    const h = harness();
    const account = await h.register();
    await h.request('/email-otp/request-password-reset', {
      email: account.email,
    });
    const checked = await h.request('/recovery/verify-code', {
      email: account.email,
      otp: '111111',
    });

    const proof = (await checked.json()) as { token: string };
    await h.request('/recovery/reset-password', {
      token: proof.token,
      password: 'Replacement123!',
    });
    const replay = await h.request('/recovery/reset-password', {
      token: proof.token,
      password: 'Attacker123!',
    });

    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({ code: 'RECOVERY_EXPIRED' });
  });

  it('rejects an expired password recovery proof without changing the password', async () => {
    const h = harness();
    const account = await h.register();
    await h.request('/email-otp/request-password-reset', {
      email: account.email,
    });
    const checked = await h.request('/recovery/verify-code', {
      email: account.email,
      otp: '111111',
    });

    expect(checked.status).toBe(200);
    const proof = (await checked.json()) as { token: string };
    const persistedProof = h.store.verification!.find(
      (value) =>
        typeof value.identifier === 'string' &&
        value.identifier.startsWith('sydia-password-reset:'),
    );

    if (!persistedProof) throw new Error('Recovery proof was not persisted');

    persistedProof.expiresAt = new Date(0);

    const reset = await h.request('/recovery/reset-password', {
      token: proof.token,
      password: 'Unauthorized123!',
    });

    expect(reset.status).toBe(400);
    expect(await reset.json()).toMatchObject({ code: 'RECOVERY_EXPIRED' });
    const login = await h.request('/sign-in/email', {
      email: account.email,
      password: 'Original123!',
    });

    expect(login.status).toBe(200);
  });

  it('rejects a password recovery proof after the account email changes', async () => {
    const h = harness();
    const account = await h.register();
    await h.request('/email-otp/request-password-reset', {
      email: account.email,
    });
    const checked = await h.request('/recovery/verify-code', {
      email: account.email,
      otp: '111111',
    });

    expect(checked.status).toBe(200);
    const proof = (await checked.json()) as { token: string };
    const sent = await h.request(
      '/email-otp/request-email-change',
      { newEmail: 'replacement@example.com', currentPassword: 'Original123!' },
      account.cookie,
    );

    expect(sent.status).toBe(200);
    const changed = await h.request(
      '/email-otp/change-email',
      { newEmail: 'replacement@example.com', otp: '222222' },
      account.cookie,
    );

    expect(changed.status).toBe(200);
    const reset = await h.request('/recovery/reset-password', {
      token: proof.token,
      password: 'Unauthorized123!',
    });

    expect(reset.status).toBe(400);
    expect(await reset.json()).toMatchObject({ code: 'RECOVERY_EXPIRED' });
    const login = await h.request('/sign-in/email', {
      email: 'replacement@example.com',
      password: 'Original123!',
    });

    expect(login.status).toBe(200);
  });

  it('requests only Google identity permissions', async () => {
    const h = harness();
    const result = await h.request('/sign-in/social', {
      provider: 'google',
      callbackURL: 'http://localhost:3000/sign-in',
      disableRedirect: true,
    });

    expect(result.status).toBe(200);
    const { url } = (await result.json()) as { url: string };
    expect(new URL(url).searchParams.get('scope')?.split(' ').sort()).toEqual([
      'email',
      'openid',
      'profile',
    ]);
    expect(new URL(url).searchParams.get('include_granted_scopes')).not.toBe(
      'true',
    );
  });

  it('rejects attempts to widen Google sign-in into Calendar authorization', async () => {
    const h = harness();
    const result = await h.request('/sign-in/social', {
      provider: 'google',
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
    });

    expect(result.status).toBe(400);
    expect(await result.json()).toMatchObject({ code: 'INVALID_AUTH_REQUEST' });
  });

  it('rejects Google confirmation callbacks with missing one-time state', async () => {
    const h = harness();
    const result = await h.request(
      '/registration/google/callback?state=wrong&code=wrong',
    );

    expect(result.status).toBe(302);
    expect(result.headers.get('location')).toBe(
      'http://localhost:3000/change-email?confirmation=failed',
    );
  });

  it('freshly confirms the linked Google subject for the initiating browser', async () => {
    const h = harness();
    const browser = await googleConfirmationBrowser(h);
    const remote = googleConfirmationTokens(browser.nonce);

    const result = await h.request(
      browser.callback,
      undefined,
      browser.browserCookie,
    );

    expect(result.status).toBe(302);
    expect(result.headers.get('location')).toBe(
      'http://localhost:3000/change-email?confirmation=complete',
    );
    expect(remote.exchange).toHaveBeenCalledWith({
      code: 'external-code',
      codeVerifier: expect.any(String),
    });
    expect(remote.verify).toHaveBeenCalledWith({
      idToken: 'remote-id-token',
      audience: 'identity-client.apps.googleusercontent.com',
    });
    const methods = await h.request(
      '/registration/methods',
      undefined,
      browser.sessionCookie,
    );

    expect(await methods.json()).toMatchObject({
      confirmed: true,
      confirmationMethod: 'google',
    });
  });

  it('rejects Google confirmation without the initiating browser cookie before token exchange', async () => {
    const h = harness();
    const browser = await googleConfirmationBrowser(h);
    const remote = googleConfirmationTokens(browser.nonce);

    const result = await h.request(
      browser.callback,
      undefined,
      browser.sessionCookie,
    );

    expect(result.headers.get('location')).toBe(
      'http://localhost:3000/change-email?confirmation=failed',
    );
    expect(remote.exchange).not.toHaveBeenCalled();
    const methods = await h.request(
      '/registration/methods',
      undefined,
      browser.sessionCookie,
    );

    expect(await methods.json()).toMatchObject({ confirmed: false });
  });

  it('rejects a different Google subject without granting email-change ownership', async () => {
    const h = harness();
    const browser = await googleConfirmationBrowser(h);
    googleConfirmationTokens(browser.nonce, 'different-google-account');

    const result = await h.request(
      browser.callback,
      undefined,
      browser.browserCookie,
    );

    expect(result.headers.get('location')).toBe(
      'http://localhost:3000/change-email?confirmation=failed',
    );
    const methods = await h.request(
      '/registration/methods',
      undefined,
      browser.sessionCookie,
    );

    expect(await methods.json()).toMatchObject({ confirmed: false });
    expect(h.store.user![0]).toMatchObject({ email: 'owner@gmail.com' });
  });

  it('rejects a mismatched Google confirmation nonce without granting ownership', async () => {
    const h = harness();
    const browser = await googleConfirmationBrowser(h);
    googleConfirmationTokens('nonce-from-another-flow');

    const result = await h.request(
      browser.callback,
      undefined,
      browser.browserCookie,
    );

    expect(result.headers.get('location')).toBe(
      'http://localhost:3000/change-email?confirmation=failed',
    );
    const methods = await h.request(
      '/registration/methods',
      undefined,
      browser.sessionCookie,
    );

    expect(await methods.json()).toMatchObject({ confirmed: false });
  });

  it('rejects replay of a completed Google ownership confirmation before token exchange', async () => {
    const h = harness();
    const browser = await googleConfirmationBrowser(h);
    const remote = googleConfirmationTokens(browser.nonce);
    const completed = await h.request(
      browser.callback,
      undefined,
      browser.browserCookie,
    );

    expect(completed.headers.get('location')).toBe(
      'http://localhost:3000/change-email?confirmation=complete',
    );
    const replay = await h.request(
      browser.callback,
      undefined,
      browser.browserCookie,
    );

    expect(replay.headers.get('location')).toBe(
      'http://localhost:3000/change-email?confirmation=failed',
    );
    expect(remote.exchange).toHaveBeenCalledTimes(1);
  });

  it('rejects a Google confirmation callback submitted from a different account session', async () => {
    const h = harness();
    const browser = await googleConfirmationBrowser(h);
    const otherAccount = await h.register('other@example.com');
    const remote = googleConfirmationTokens(browser.nonce);

    const result = await h.request(
      browser.callback,
      undefined,
      [otherAccount.cookie, browser.confirmationCookie].join('; '),
    );

    expect(result.headers.get('location')).toBe(
      'http://localhost:3000/change-email?confirmation=failed',
    );
    expect(remote.exchange).not.toHaveBeenCalled();
    const methods = await h.request(
      '/registration/methods',
      undefined,
      browser.sessionCookie,
    );

    expect(await methods.json()).toMatchObject({ confirmed: false });
  });

  it('rejects a Google confirmation callback from a different session of the same account', async () => {
    const h = harness();
    const browser = await googleConfirmationBrowser(h);
    const secondLogin = await h.googleFlow('owner@gmail.com', true);

    expect(secondLogin.status).toBe(302);
    const secondSessionCookie = secondLogin.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');

    const remote = googleConfirmationTokens(browser.nonce);
    const result = await h.request(
      browser.callback,
      undefined,
      [secondSessionCookie, browser.confirmationCookie].join('; '),
    );

    expect(result.headers.get('location')).toBe(
      'http://localhost:3000/change-email?confirmation=failed',
    );
    expect(remote.exchange).not.toHaveBeenCalled();
    const methods = await h.request(
      '/registration/methods',
      undefined,
      browser.sessionCookie,
    );

    expect(await methods.json()).toMatchObject({ confirmed: false });
  });
});
