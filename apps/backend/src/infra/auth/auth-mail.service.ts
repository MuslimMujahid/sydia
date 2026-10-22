import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
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
export class AuthMailService implements OnModuleDestroy {
  private readonly logger = new Logger(AuthMailService.name);
  private readonly transport: Transporter;
  private readonly sender: string;

  constructor(config: ConfigService) {
    this.sender = config.getOrThrow<string>('BACKEND_MAIL_FROM');
    this.transport = nodemailer.createTransport({
      url: config.getOrThrow<string>('BACKEND_SMTP_URL'),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  async send({ email, otp, type }: AuthMail): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.sender,
        to: email,
        subject: SUBJECTS[type],
        text: `${SUBJECTS[type]}\n\nKode Anda: ${otp}\n\nKode ini berlaku selama 10 menit dan hanya dapat digunakan sekali. Jangan bagikan kode ini kepada siapa pun. Jika Anda tidak meminta kode ini, abaikan email ini.`,
      });
    } catch {
      // Never log the transport error: it may contain credentials or message data.
      this.logger.error(
        'Authentication email delivery failed. Check BACKEND_SMTP_URL and the mail server.',
      );
      throw new APIError('SERVICE_UNAVAILABLE', {
        code: 'AUTH_DELIVERY_FAILED',
        message: 'Kode belum terkirim. Silakan coba lagi.',
      });
    }
  }

  onModuleDestroy(): void {
    this.transport.close();
  }
}
