import { describe, expect, it } from '@jest/globals';
import { getCookies } from 'better-auth/cookies';
import type { PrismaService } from '../prisma';
import { createAuth, getSharedCookieDomain } from './auth';

const noopRepository = { record: (): Promise<void> => Promise.resolve() };
const noopProvisioner = (): Promise<void> => Promise.resolve();

function authFor(trustedOrigins: string[], baseURL: string) {
  return createAuth({} as PrismaService, {
    secret: 'test-secret-that-is-long-enough-for-auth',
    baseURL,
    trustedOrigins,
    auditEventRepository: noopRepository,
    provisionDefaultCategories: noopProvisioner,
  });
}

describe('getSharedCookieDomain', () => {
  it('derives the production shared parent domain', () => {
    expect(
      getSharedCookieDomain(
        ['https://sydia.muslimmujahid.com'],
        'https://sydia-api.muslimmujahid.com',
      ),
    ).toBe('muslimmujahid.com');
  });

  it('does not derive a domain for localhost', () => {
    expect(
      getSharedCookieDomain(['http://localhost:3000'], 'http://localhost:3001'),
    ).toBeUndefined();
  });

  it('does not derive a domain for unrelated hosts', () => {
    expect(
      getSharedCookieDomain(
        ['https://sydia.example.com'],
        'https://api.other.com',
      ),
    ).toBeUndefined();
  });

  it('does not derive a domain when either URL is HTTP', () => {
    expect(
      getSharedCookieDomain(
        ['http://sydia.muslimmujahid.com'],
        'https://sydia-api.muslimmujahid.com',
      ),
    ).toBeUndefined();
  });
});

describe('createAuth cookie contract', () => {
  it('uses a secure shared-domain session cookie in production', () => {
    const auth = authFor(
      ['https://sydia.muslimmujahid.com'],
      'https://sydia-api.muslimmujahid.com',
    );

    const sessionCookie = getCookies(auth.options).sessionToken;

    expect(sessionCookie.name).toBe('__Secure-better-auth.session_token');
    expect(sessionCookie.attributes).toMatchObject({
      domain: 'muslimmujahid.com',
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
    });
  });

  it('keeps local HTTP session cookies host-only and non-secure', () => {
    const auth = authFor(['http://localhost:3000'], 'http://localhost:3001');
    const sessionCookie = getCookies(auth.options).sessionToken;

    expect(sessionCookie.name).toBe('better-auth.session_token');
    expect(sessionCookie.attributes).toMatchObject({
      secure: false,
      httpOnly: true,
      sameSite: 'lax',
    });
    expect(sessionCookie.attributes.domain).toBeUndefined();
  });

  it('uses a matching trusted origin when the configured origin is local', () => {
    const auth = authFor(
      ['http://localhost:3000', 'https://sydia.muslimmujahid.com'],
      'https://sydia-api.muslimmujahid.com',
    );

    const sessionCookie = getCookies(auth.options).sessionToken;

    expect(sessionCookie.attributes.domain).toBe('muslimmujahid.com');
  });
});
