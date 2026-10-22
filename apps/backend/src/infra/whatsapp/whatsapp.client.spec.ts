import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { GoWhatsAppHttpClient } from './whatsapp.client';

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const qrUrl =
  'http://127.0.0.1:3001/statics/images/qrcode/scan-qr-12345678-abcd.png';

const makeClient = (deviceId = 'assistant-a') =>
  new GoWhatsAppHttpClient({ baseUrl: 'http://127.0.0.1:3001', deviceId });

function qrResponse(link = qrUrl, duration = 30) {
  return Response.json({
    code: 'SUCCESS',
    results: { qr_link: link, qr_duration: duration },
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

test('an outbound send without a selected assistant never uses the provider default device', async () => {
  const request = jest.spyOn(globalThis, 'fetch');
  const client = new GoWhatsAppHttpClient({ baseUrl: 'http://127.0.0.1:3001' });
  await expect(
    client.sendText('owner@s.whatsapp.net', 'Hello'),
  ).rejects.toThrow('explicit device');
  expect(request).not.toHaveBeenCalled();
});

test('on-demand media lookup carries the selected device and encodes the message and owner IDs', async () => {
  const result = {
    message_id: 'message/a',
    file_path: 'statics/media/owner/image.jpg',
    file_size: 3,
  };

  const request = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(Response.json({ code: 'SUCCESS', results: result }));

  await expect(
    makeClient().downloadMedia('owner@s.whatsapp.net', 'message/a'),
  ).resolves.toEqual(result);
  expect(request).toHaveBeenCalledWith(
    'http://127.0.0.1:3001/message/message%2Fa/download?phone=owner%40s.whatsapp.net',
    expect.objectContaining({ headers: { 'X-Device-Id': 'assistant-a' } }),
  );
});

test('outbound files carry their bytes and reply context through the selected assistant', async () => {
  const request = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({
      code: 'SUCCESS',
      results: { message_id: 'sent-file', status: 'sent' },
    }),
  );

  await makeClient().sendFile(
    'owner@s.whatsapp.net',
    {
      filename: 'receipt.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('pdf-bytes'),
    },
    'Receipt',
    'owner-message',
  );
  const call = request.mock.calls[0];
  expect(call?.[0]).toBe('http://127.0.0.1:3001/send/file');
  expect(call?.[1]?.headers).toEqual({ 'X-Device-Id': 'assistant-a' });
  const form = call?.[1]?.body;
  if (!(form instanceof FormData))
    throw new Error('File send did not produce multipart data.');
  expect(form.get('phone')).toBe('owner@s.whatsapp.net');
  expect(form.get('reply_message_id')).toBe('owner-message');
  const file = form.get('file');
  if (!(file instanceof Blob))
    throw new Error('File send did not include its bytes.');
  expect(await file.text()).toBe('pdf-bytes');
  expect(file.type).toBe('application/pdf');
});

describe('GoWA QR login', () => {
  test('QR login and asset fetch select the same explicit assistant device', async () => {
    const request = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(qrResponse())
      .mockResolvedValueOnce(
        new Response(png, { headers: { 'Content-Type': 'image/png' } }),
      );

    const qr = await makeClient().loginQr();
    expect(qr).toEqual({ image: png, durationSeconds: 30 });
    expect(request).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:3001/app/login',
      expect.objectContaining({ headers: { 'X-Device-Id': 'assistant-a' } }),
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      new URL(qrUrl),
      expect.objectContaining({
        headers: { 'X-Device-Id': 'assistant-a' },
        redirect: 'error',
      }),
    );
  });

  test('accepts the QR asset directory returned by the deployed v9.3.0 provider', async () => {
    const url =
      'http://127.0.0.1:3001/statics/qrcode/scan-qr-12345678-abcd.png';

    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(qrResponse(url))
      .mockResolvedValueOnce(
        new Response(png, { headers: { 'Content-Type': 'image/png' } }),
      );
    await expect(makeClient().loginQr()).resolves.toEqual({
      image: png,
      durationSeconds: 30,
    });
  });

  test('QR login without a selected device never calls the provider', async () => {
    const request = jest.spyOn(globalThis, 'fetch');
    await expect(
      new GoWhatsAppHttpClient({ baseUrl: 'http://127.0.0.1:3001' }).loginQr(),
    ).rejects.toThrow('explicit device');
    expect(request).not.toHaveBeenCalled();
  });

  test.each([
    'https://attacker.example/qr.png',
    'http://127.0.0.1:3001/admin/scan-qr-123.png',
    'http://user:password@127.0.0.1:3001/statics/images/qrcode/scan-qr-123.png',
    qrUrl + '?redirect=https://attacker.example',
    'http://127.0.0.1:3001/statics/images/qrcode/scan-qr-123.svg',
  ])('rejects untrusted QR source %s before an asset request', async (link) => {
    const request = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(qrResponse(link));

    await expect(makeClient().loginQr()).rejects.toThrow('untrusted QR');
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('rejects provider validity that is absent instead of inventing expiry', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ results: { qr_link: qrUrl } }));
    await expect(makeClient().loginQr()).rejects.toThrow('invalid QR validity');
  });

  test('rejects non-image content from an otherwise trusted QR path', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(qrResponse())
      .mockResolvedValueOnce(
        new Response('<html>error</html>', {
          headers: { 'Content-Type': 'text/html' },
        }),
      );
    await expect(makeClient().loginQr()).rejects.toThrow(
      'invalid content type',
    );
  });

  test('enforces actual streamed byte size instead of trusting content length', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(qrResponse())
      .mockResolvedValueOnce(
        new Response(Buffer.alloc(256_001), {
          headers: { 'Content-Type': 'image/png', 'Content-Length': '10' },
        }),
      );
    await expect(makeClient().loginQr()).rejects.toThrow('size limit');
  });

  test('rejects a file falsely labeled as PNG', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(qrResponse())
      .mockResolvedValueOnce(
        new Response('not-png', { headers: { 'Content-Type': 'image/png' } }),
      );
    await expect(makeClient().loginQr()).rejects.toThrow('not a PNG');
  });

  test('malformed provider JSON is a surfaced failure', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('invalid-json'));
    await expect(makeClient().loginQr()).rejects.toThrow('malformed JSON');
  });
});
