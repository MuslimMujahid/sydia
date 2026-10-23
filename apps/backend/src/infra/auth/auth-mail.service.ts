import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APIError } from 'better-auth/api';

export type AuthMail = {
  email: string;
  otp: string;
  type: 'sign-in' | 'email-verification' | 'forget-password' | 'change-email';
};

const SUBJECTS: Record<AuthMail['type'], string> = {
  'email-verification': 'Verifikasi email Sydia Anda',
  'forget-password': 'Pulihkan kata sandi Sydia Anda',
  'change-email': 'Verifikasi email baru Sydia Anda',
  'sign-in': 'Kode masuk Sydia Anda',
};

@Injectable()
export class AuthMailService {
  private readonly logger = new Logger(AuthMailService.name);
  private readonly apiKey: string;
  private readonly sender: string;
  private readonly development: boolean;

  constructor(config: ConfigService) {
    this.development = config.get<string>('NODE_ENV') === 'development';
    this.sender = config.getOrThrow<string>('BACKEND_MAIL_FROM');
    this.apiKey = config.getOrThrow<string>('BACKEND_RESEND_API_KEY');

    if (!this.sender.trim() || !this.apiKey.trim()) {
      throw new Error(
        'BACKEND_MAIL_FROM and BACKEND_RESEND_API_KEY must be non-empty.',
      );
    }
  }

  async send({ email, otp, type }: AuthMail): Promise<void> {
    // Local development only: without a mail server the code is read from this log.
    if (this.development)
      this.logger.warn(`auth.dev_otp type=${type} email=${email} otp=${otp}`);

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          from: this.sender,
          to: [email],
          subject: SUBJECTS[type],
          text: `${SUBJECTS[type]}\n\nKode Anda: ${otp}\n\nKode ini berlaku selama 10 menit dan hanya dapat digunakan sekali. Jangan bagikan kode ini kepada siapa pun. Jika Anda tidak meminta kode ini, abaikan email ini.`,
        }),
      });

      if (!response.ok) {
        throw new Error('Resend rejected authentication email delivery.');
      }

      const result: unknown = await response.json();

      if (
        !result ||
        typeof result !== 'object' ||
        !('id' in result) ||
        typeof result.id !== 'string' ||
        !result.id.trim()
      ) {
        throw new Error('Resend did not return an email ID.');
      }
    } catch {
      // Never log provider responses or fetch errors: they may contain authentication data.
      this.logger.error(
        'Authentication email delivery failed. Check BACKEND_RESEND_API_KEY, the verified BACKEND_MAIL_FROM domain, and Resend delivery logs.',
      );
      throw new APIError('SERVICE_UNAVAILABLE', {
        code: 'AUTH_DELIVERY_FAILED',
        message: 'Kode belum terkirim. Silakan coba lagi.',
      });
    }
  }
}
