import { describe, expect, it } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { SecretCipher } from './secret-cipher';

function cipher(key: string): SecretCipher {
  return new SecretCipher(
    new ConfigService({ BACKEND_SECRET_ENCRYPTION_KEY: key }),
  );
}

describe('SecretCipher', () => {
  it('round-trips encrypted values without retaining plaintext', () => {
    const subject = cipher('a-distinct-secret-key-with-at-least-32-characters');
    const encrypted = subject.encrypt('ATM_NUM:123 | ATM_PASSWORD:456');

    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain('123');
    expect(subject.decrypt(encrypted)).toBe('ATM_NUM:123 | ATM_PASSWORD:456');
  });

  it('rejects ciphertext encrypted with another key', () => {
    const encrypted = cipher(
      'first-distinct-secret-key-with-at-least-32-characters',
    ).encrypt('sensitive');

    expect(() =>
      cipher('second-distinct-secret-key-with-at-least-32-characters').decrypt(
        encrypted,
      ),
    ).toThrow();
  });
});
