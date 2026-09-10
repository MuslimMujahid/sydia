import type { Secret as PrismaSecret } from '../../generated/prisma/client';

export type Secret = Pick<
  PrismaSecret,
  'id' | 'label' | 'createdAt' | 'updatedAt' | 'lastRevealedAt' | 'revealCount'
>;

export type SecretRecord = Secret & Pick<PrismaSecret, 'encryptedValue'>;

export type SecretWrite = {
  label: string;
  encryptedValue: string;
};

export type SecretRevealRecord = {
  tokenId: string;
  userId: string;
  secret: SecretRecord;
  expiresAt: Date;
};
