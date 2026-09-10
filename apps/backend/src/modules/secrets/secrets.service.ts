import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import {
  AUDIT_EVENT_REPOSITORY,
  CONVERSATION_REPOSITORY,
  SECRET_REPOSITORY,
  type IAuditEventRepository,
  type IConversationRepository,
  type ISecretRepository,
} from '../../database/interfaces';
import type { Secret } from '../../database/entities';
import { SecretCipher } from '../../infra/crypto';

const REVEAL_TTL_MS = 5 * 60_000;
const EXPLICIT_SAVE_INTENT =
  /\b(save|store|remember|keep|add|simpan|catat|ingat|masukkan)\b[\s\S]{0,80}\b(secret|password|passcode|pin|cvv|cvc|kata sandi|sandi|rahasia|kode)\b|\b(secret|password|passcode|pin|cvv|cvc|kata sandi|sandi|rahasia|kode)\b[\s\S]{0,80}\b(save|store|remember|keep|add|simpan|catat|ingat|masukkan)\b/i;

const NEGATED_SAVE_INTENT =
  /\b(don't|do not|never|jangan|tidak usah|nggak usah|ga usah)\b[\s\S]{0,40}\b(save|store|remember|keep|simpan|catat|ingat)\b/i;

export type SecretRevealLink = { url: string; expiresAt: Date };
export type RevealedSecret = { label: string; value: string; expiresAt: Date };

@Injectable()
export class SecretsService {
  private readonly frontendUrl: string;

  constructor(
    @Inject(SECRET_REPOSITORY) private readonly secrets: ISecretRepository,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: IConversationRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly audit: IAuditEventRepository,
    private readonly cipher: SecretCipher,
    config: ConfigService,
  ) {
    this.frontendUrl = config.getOrThrow<string>('FRONTEND_URL');
  }

  list(userId: string): Promise<Secret[]> {
    return this.secrets.list(userId);
  }

  async create(
    userId: string,
    input: { label: string; value: string },
  ): Promise<Secret> {
    const secret = await this.secrets.create(userId, {
      label: input.label,
      encryptedValue: this.cipher.encrypt(input.value),
    });

    await this.audit.record({
      userId,
      eventType: 'secret.created',
      metadata: { id: secret.id },
    });

    return secret;
  }

  async createFromChat(
    userId: string,
    sourceMessageId: string,
    input: { label: string; value: string },
  ): Promise<Secret> {
    const source = await this.conversations.findUserMessageContent(
      userId,
      sourceMessageId,
    );

    if (
      !source ||
      !EXPLICIT_SAVE_INTENT.test(source) ||
      NEGATED_SAVE_INTENT.test(source)
    ) {
      throw new Error('Instruksi eksplisit untuk menyimpan secret diperlukan.');
    }

    const secret = await this.create(userId, input);
    const masked = this.maskStoredValue(source, input.value);
    await this.conversations.maskUserMessage(userId, sourceMessageId, masked);
    await this.conversations.maskActiveChannelTurns(
      userId,
      sourceMessageId,
      masked,
    );

    return secret;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const deleted = await this.secrets.delete(userId, id);

    if (deleted) {
      await this.audit.record({
        userId,
        eventType: 'secret.deleted',
        metadata: { id },
      });
    }

    return deleted;
  }

  async createRevealLink(
    userId: string,
    secretId: string,
  ): Promise<SecretRevealLink | null> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + REVEAL_TTL_MS);
    const created = await this.secrets.createRevealToken({
      userId,
      secretId,
      tokenHash,
      expiresAt,
    });

    if (!created) return null;

    await this.audit.record({
      userId,
      eventType: 'secret.reveal_issued',
      metadata: { id: secretId, expiresAt },
    });

    return {
      url: `${this.frontendUrl}/secret-reveal#${token}`,
      expiresAt,
    };
  }

  async reveal(token: string): Promise<RevealedSecret | null> {
    const tokenHash = this.hashToken(token);
    const now = new Date();
    const consumed = await this.secrets.consumeRevealToken(tokenHash, now);

    if (!consumed) {
      await this.secrets.recordFailedReveal(tokenHash);

      return null;
    }

    const value = this.cipher.decrypt(consumed.secret.encryptedValue);
    await this.secrets.recordReveal(consumed.tokenId, consumed.secret.id, now);
    await this.audit.record({
      userId: consumed.userId,
      eventType: 'secret.revealed',
      metadata: { id: consumed.secret.id },
    });

    return {
      label: consumed.secret.label,
      value,
      expiresAt: consumed.expiresAt,
    };
  }

  async search(userId: string, query: string): Promise<Secret[]> {
    return this.secrets.search(userId, query);
  }

  async unlockSession(
    userId: string,
    sessionId: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.secrets.unlockSession(userId, sessionId, expiresAt);
  }

  async revealInSession(
    userId: string,
    sessionId: string,
    secretId: string,
  ): Promise<RevealedSecret | null> {
    const now = new Date();

    if (!(await this.secrets.sessionUnlocked(userId, sessionId, now))) {
      throw new Error('SECRET_VAULT_LOCKED');
    }

    const secret = await this.secrets.findEncrypted(userId, secretId);
    if (!secret) return null;
    const value = this.cipher.decrypt(secret.encryptedValue);

    await this.audit.record({
      userId,
      eventType: 'secret.revealed_in_session',
      metadata: { id: secret.id },
    });

    return {
      label: secret.label,
      value,
      expiresAt: new Date(Date.now() + 30_000),
    };
  }

  private maskStoredValue(source: string, value: string): string {
    const fields = value
      .split(/\s*\|\s*/)
      .map((part) => {
        const field = part.includes(':')
          ? part.slice(part.indexOf(':') + 1).trim()
          : part.trim();

        return field.startsWith('<') && field.endsWith('>')
          ? field.slice(1, -1).trim()
          : field;
      })
      .filter(Boolean)
      .sort((left, right) => right.length - left.length);

    return fields.reduce((masked, field) => {
      const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      return masked.replace(new RegExp(escaped, 'gi'), '****');
    }, source);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
