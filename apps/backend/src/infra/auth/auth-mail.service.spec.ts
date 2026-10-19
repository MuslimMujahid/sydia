import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { AuthMailService } from './auth-mail.service';

afterEach(() => {
  jest.restoreAllMocks();
});

function setup() {
  const sendMail = jest.fn<(input: unknown) => Promise<unknown>>();
  const close = jest.fn();
  jest.spyOn(nodemailer, 'createTransport').mockReturnValue({
    sendMail,
    close,
  } as unknown as ReturnType<typeof nodemailer.createTransport>);
  const service = new AuthMailService(
    new ConfigService({
      BACKEND_SMTP_URL: 'smtp://localhost:1025',
      BACKEND_MAIL_FROM: 'Sydia <noreply@sydia.local>',
    }),
  );

  return { service, sendMail, close };
}

describe('authentication mail delivery', () => {
  it('sends a purpose-specific message with the expiry and code', async () => {
    const { service, sendMail } = setup();
    sendMail.mockResolvedValue({});

    await service.send({
      email: 'owner@example.com',
      otp: '123456',
      type: 'change-email',
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'Sydia <noreply@sydia.local>',
      to: 'owner@example.com',
      subject: 'Verifikasi email baru Sydia Anda',
      text: 'Verifikasi email baru Sydia Anda\n\nKode Anda: 123456\n\nKode ini berlaku selama 10 menit dan hanya dapat digunakan sekali. Jangan bagikan kode ini kepada siapa pun. Jika Anda tidak meminta kode ini, abaikan email ini.',
    });
  });

  it('surfaces delivery rejection and logs no message or credentials', async () => {
    const { service, sendMail } = setup();
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    sendMail.mockRejectedValue(new Error('password=secret, code=123456'));

    await expect(
      service.send({
        email: 'owner@example.com',
        otp: '123456',
        type: 'forget-password',
      }),
    ).rejects.toThrow('Kode belum terkirim. Silakan coba lagi.');

    expect(log).toHaveBeenCalledWith(
      'Authentication email delivery failed. Check BACKEND_SMTP_URL and the mail server.',
    );
  });

  it('releases the SMTP transport on shutdown', () => {
    const { service, close } = setup();
    service.onModuleDestroy();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
