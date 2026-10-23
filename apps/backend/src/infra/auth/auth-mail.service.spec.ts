import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AuthMailService } from './auth-mail.service';

const deliveryFailure = {
  status: 'SERVICE_UNAVAILABLE',
  body: {
    code: 'AUTH_DELIVERY_FAILED',
    message: 'Kode belum terkirim. Silakan coba lagi.',
  },
};

const safeDiagnostic =
  'Authentication email delivery failed. Check BACKEND_RESEND_API_KEY, the verified BACKEND_MAIL_FROM domain, and Resend delivery logs.';

afterEach(() => {
  jest.restoreAllMocks();
});

function setup() {
  const request = jest.spyOn(globalThis, 'fetch');
  const log = jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);

  const service = new AuthMailService(
    new ConfigService({
      BACKEND_RESEND_API_KEY: 're_test_key',
      BACKEND_MAIL_FROM: 'Sydia <no-reply@sydia.id>',
    }),
  );

  return { service, request, log };
}

const mail = {
  email: 'owner@example.com',
  otp: '123456',
  type: 'change-email',
} as const;

describe('authentication mail delivery', () => {
  it('sends the purpose-specific code through the authenticated Resend API', async () => {
    const { service, request } = setup();
    request.mockResolvedValue(Response.json({ id: 'email-id' }));

    await service.send(mail);

    expect(request).toHaveBeenCalledWith('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer re_test_key',
        'Content-Type': 'application/json',
      },
      signal: expect.any(AbortSignal),
      body: JSON.stringify({
        from: 'Sydia <no-reply@sydia.id>',
        to: ['owner@example.com'],
        subject: 'Verifikasi email baru Sydia Anda',
        text: 'Verifikasi email baru Sydia Anda\n\nKode Anda: 123456\n\nKode ini berlaku selama 10 menit dan hanya dapat digunakan sekali. Jangan bagikan kode ini kepada siapa pun. Jika Anda tidak meminta kode ini, abaikan email ini.',
      }),
    });
  });

  it.each([
    ['sign-in', 'Kode masuk Sydia Anda'],
    ['email-verification', 'Verifikasi email Sydia Anda'],
    ['forget-password', 'Pulihkan kata sandi Sydia Anda'],
  ] as const)('preserves the subject for %s codes', async (type, subject) => {
    const { service, request } = setup();
    request.mockResolvedValue(Response.json({ id: 'email-id' }));

    await service.send({ ...mail, type });

    expect(request).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ body: expect.stringContaining(subject) }),
    );
  });

  it.each([401, 403, 429, 500])(
    'surfaces HTTP %i without logging provider data',
    async (status) => {
      const { service, request, log } = setup();
      request.mockResolvedValue(
        Response.json({ message: 'secret, code=123456' }, { status }),
      );

      await expect(service.send(mail)).rejects.toMatchObject(deliveryFailure);

      expect(log.mock.calls).toEqual([[safeDiagnostic]]);
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it('surfaces network errors without logging credentials or the code', async () => {
    const { service, request, log } = setup();
    request.mockRejectedValue(new Error('key=re_secret, code=123456'));

    await expect(service.send(mail)).rejects.toMatchObject(deliveryFailure);

    expect(log.mock.calls).toEqual([[safeDiagnostic]]);
  });

  it('bounds delivery to 15 seconds and surfaces timeouts', async () => {
    const { service, request, log } = setup();
    const signal = new AbortController().signal;
    const timeout = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(signal);
    request.mockRejectedValue(new DOMException('Timed out', 'TimeoutError'));

    await expect(service.send(mail)).rejects.toMatchObject(deliveryFailure);

    expect(timeout).toHaveBeenCalledWith(15_000);
    expect(request).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal }),
    );
    expect(log.mock.calls).toEqual([[safeDiagnostic]]);
  });

  it.each([{}, { id: '' }, { id: 123 }, null])(
    'rejects acceptance without a valid email ID: %j',
    async (body) => {
      const { service, request, log } = setup();
      request.mockResolvedValue(Response.json(body));

      await expect(service.send(mail)).rejects.toMatchObject(deliveryFailure);

      expect(log.mock.calls).toEqual([[safeDiagnostic]]);
    },
  );

  it('surfaces malformed provider JSON', async () => {
    const { service, request, log } = setup();
    request.mockResolvedValue(new Response('not JSON', { status: 200 }));

    await expect(service.send(mail)).rejects.toMatchObject(deliveryFailure);

    expect(log.mock.calls).toEqual([[safeDiagnostic]]);
  });

  it.each(['BACKEND_RESEND_API_KEY', 'BACKEND_MAIL_FROM'])(
    'requires %s at startup',
    (name) => {
      jest.replaceProperty(process, 'env', {});
      const values: Record<string, string> = {
        BACKEND_RESEND_API_KEY: 're_test_key',
        BACKEND_MAIL_FROM: 'Sydia <no-reply@sydia.id>',
      };

      delete values[name];
      const config = new ConfigService(values);

      expect(() => new AuthMailService(config)).toThrow(name);
    },
  );

  it('rejects empty delivery configuration at startup', () => {
    const config = new ConfigService({
      BACKEND_RESEND_API_KEY: ' ',
      BACKEND_MAIL_FROM: ' ',
    });

    expect(() => new AuthMailService(config)).toThrow('must be non-empty');
  });
});
