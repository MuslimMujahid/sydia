import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const KEY_SALT = 'sydia-token-cipher';

@Injectable()
export class TokenCipher {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const secret =
      config.get<string>('BACKEND_TOKEN_ENCRYPTION_KEY') ||
      config.get<string>('BACKEND_AUTH_SECRET');

    if (!secret) {
      throw new Error(
        'BACKEND_TOKEN_ENCRYPTION_KEY or BACKEND_AUTH_SECRET is required',
      );
    }

    this.key = scryptSync(secret, KEY_SALT, KEY_LENGTH);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return `v1.${iv.toString('base64url')}.${authTag.toString('base64url')}.${ciphertext.toString('base64url')}`;
  }

  decrypt(payload: string): string {
    if (!payload.startsWith('v1.')) return payload;

    const parts = payload.split('.');

    if (parts.length !== 4) {
      throw new Error('Invalid token cipher payload');
    }

    const ivEncoded = parts[1];
    const authTagEncoded = parts[2];
    const ciphertextEncoded = parts[3];

    if (!ivEncoded || !authTagEncoded || !ciphertextEncoded) {
      throw new Error('Invalid token cipher payload');
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(ivEncoded, 'base64url'),
    );

    decipher.setAuthTag(Buffer.from(authTagEncoded, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextEncoded, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
