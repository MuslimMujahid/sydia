import { describe, expect, it } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { TokenCipher } from './token-cipher';

describe('TokenCipher', () => {
  it('round-trips encrypted plaintext', () => {
    const cipher = new TokenCipher(
      new ConfigService({ BACKEND_TOKEN_ENCRYPTION_KEY: 'token-key' }),
    );
    const encrypted = cipher.encrypt('access-token');

    expect(encrypted).toMatch(/^v1\.[^.]+\.[^.]+\.[^.]+$/);
    expect(cipher.decrypt(encrypted)).toBe('access-token');
  });

  it('uses a random IV for each encryption', () => {
    const cipher = new TokenCipher(
      new ConfigService({ BACKEND_TOKEN_ENCRYPTION_KEY: 'token-key' }),
    );

    expect(cipher.encrypt('same-token')).not.toBe(cipher.encrypt('same-token'));
  });

  it('passes through legacy plaintext values', () => {
    const cipher = new TokenCipher(
      new ConfigService({ BACKEND_TOKEN_ENCRYPTION_KEY: 'token-key' }),
    );

    expect(cipher.decrypt('legacy-access-token')).toBe('legacy-access-token');
  });

  it('falls back to the auth secret when no dedicated key is configured', () => {
    const cipher = new TokenCipher(
      new ConfigService({ BACKEND_AUTH_SECRET: 'auth-secret' }),
    );

    expect(cipher.decrypt(cipher.encrypt('token'))).toBe('token');
  });

  it('requires an encryption secret', () => {
    expect(() => new TokenCipher(new ConfigService())).toThrow(
      'BACKEND_TOKEN_ENCRYPTION_KEY or BACKEND_AUTH_SECRET is required',
    );
  });
});
