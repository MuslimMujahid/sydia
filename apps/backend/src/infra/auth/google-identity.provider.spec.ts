import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { LoginTicket, type TokenPayload } from 'google-auth-library';
import {
  googleEmailIsAuthoritative,
  googleIdentityProvider,
} from './google-identity.provider';

afterEach(() => {
  jest.restoreAllMocks();
});
const client = {
  clientId: 'identity-client.apps.googleusercontent.com',
  clientSecret: 'fixture-secret',
};

const claims: TokenPayload = {
  iss: 'https://accounts.google.com',
  aud: client.clientId,
  sub: 'google-owner',
  email: 'owner@gmail.com',
  email_verified: true,
  iat: 1_000_000,
  exp: 2_000_000,
};

describe('Google identity verification', () => {
  it('accepts verified Gmail ownership', () => {
    expect(
      googleEmailIsAuthoritative({
        email: 'owner@gmail.com',
        email_verified: true,
      }),
    ).toBe(true);
  });
  it('accepts verified Google Workspace ownership', () => {
    expect(
      googleEmailIsAuthoritative({
        email: 'owner@company.test',
        email_verified: true,
        hd: 'company.test',
      }),
    ).toBe(true);
  });
  it('requires a mailbox code for a third-party email even when Google once verified it', () => {
    expect(
      googleEmailIsAuthoritative({
        email: 'owner@third-party.test',
        email_verified: true,
      }),
    ).toBe(false);
  });
  it('requires a mailbox code when the Google claim is unverified', () => {
    expect(
      googleEmailIsAuthoritative({
        email: 'owner@gmail.com',
        email_verified: false,
      }),
    ).toBe(false);
  });
  it('verifies the ID token against the configured identity audience', async () => {
    const verifyIdToken = jest
      .fn<(input: unknown) => Promise<LoginTicket>>()
      .mockResolvedValue(new LoginTicket('', claims));

    const provider = googleIdentityProvider(client, { verifyIdToken });
    const result = await provider.getUserInfo({ idToken: 'external-id-token' });
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'external-id-token',
      audience: client.clientId,
    });
    expect(result?.user).toMatchObject({
      email: 'owner@gmail.com',
      emailVerified: true,
    });
  });
  it('logs a safe failure and refuses identity when Google token validation fails', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const verifyIdToken = jest
      .fn<(input: unknown) => Promise<LoginTicket>>()
      .mockRejectedValue(new Error('id_token=secret'));

    const provider = googleIdentityProvider(client, { verifyIdToken });
    await expect(
      provider.getUserInfo({ idToken: 'external-id-token' }),
    ).resolves.toBeNull();
    expect(log).toHaveBeenCalledWith(
      'Google identity validation failed. No account was authenticated or linked; check the identity client configuration and Google availability.',
    );
  });
  it('refuses a mismatched OIDC nonce', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const verifyIdToken = jest
      .fn<(input: unknown) => Promise<LoginTicket>>()
      .mockResolvedValue(new LoginTicket('', claims));

    const provider = googleIdentityProvider(client, { verifyIdToken });
    await expect(
      provider.getUserInfo({
        idToken: 'external-id-token',
        expectedIdTokenNonce: 'expected-nonce',
      }),
    ).resolves.toBeNull();
  });
});
