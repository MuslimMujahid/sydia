import type {
  Secret,
  SecretRecord,
  SecretRevealRecord,
  SecretWrite,
} from '../entities';

export interface ISecretRepository {
  list(userId: string): Promise<Secret[]>;
  findById(userId: string, id: string): Promise<Secret | null>;
  search(userId: string, query: string): Promise<Secret[]>;
  create(userId: string, input: SecretWrite): Promise<Secret>;
  delete(userId: string, id: string): Promise<boolean>;
  createRevealToken(input: {
    userId: string;
    secretId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<boolean>;
  consumeRevealToken(
    tokenHash: string,
    now: Date,
  ): Promise<SecretRevealRecord | null>;
  recordReveal(tokenId: string, secretId: string, now: Date): Promise<boolean>;
  recordFailedReveal(tokenHash: string): Promise<void>;
  findEncrypted(userId: string, id: string): Promise<SecretRecord | null>;
  unlockSession(
    userId: string,
    sessionId: string,
    expiresAt: Date,
  ): Promise<void>;
  sessionUnlocked(
    userId: string,
    sessionId: string,
    now: Date,
  ): Promise<boolean>;
}

export const SECRET_REPOSITORY = Symbol('ISecretRepository');
