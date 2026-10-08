import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { DocumentParserSettings } from './document-parser.config';
import { LocalOcr } from './local-ocr';

const result = { text: 'Invoice SYD-12345', tsv: null, confidence: 98 };

function worker() {
  return {
    setParameters: jest.fn(() => Promise.resolve(undefined)),
    recognize: jest.fn(() => Promise.resolve({ data: result })),
    terminate: jest.fn(() => Promise.resolve(undefined)),
  };
}

function limits() {
  return new DocumentParserSettings(
    new ConfigService({
      BACKEND_DOCUMENT_OCR_LANG_PATH: '/local/languages',
      BACKEND_DOCUMENT_OCR_TIMEOUT_MS: 1000,
    }),
  ).limits;
}

describe('LocalOcr deadlines', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('times out initialization and terminates a worker that arrives late', async () => {
    const late = worker();
    let initialize!: (value: typeof late) => void;
    const create = jest.fn(
      () =>
        new Promise<typeof late>((resolve) => {
          initialize = resolve;
        }),
    );

    const ocr = new LocalOcr(limits(), create);
    const pending = ocr.recognize(Buffer.from('image'));
    const rejected = expect(pending).rejects.toMatchObject({
      code: 'OCR_TIMEOUT',
    });

    await jest.advanceTimersByTimeAsync(1000);
    await rejected;

    let initializationSettled = false;
    const cleanup = ocr.waitForInitialization().then(() => {
      initializationSettled = true;
    });

    await jest.advanceTimersByTimeAsync(0);
    expect(initializationSettled).toBe(false);
    initialize(late);
    await jest.advanceTimersByTimeAsync(0);
    await cleanup;
    expect(initializationSettled).toBe(true);
    expect(late.terminate).toHaveBeenCalledTimes(1);
    expect(late.setParameters).not.toHaveBeenCalled();
    expect(late.recognize).not.toHaveBeenCalled();
    await ocr.close();
    expect(late.terminate).toHaveBeenCalledTimes(1);
  });

  test('uses one budget for initialization and recognition', async () => {
    const active = worker();
    active.recognize.mockImplementation(() => new Promise(() => {}));
    const create = () =>
      new Promise<typeof active>((resolve) => {
        setTimeout(() => resolve(active), 600);
      });

    const ocr = new LocalOcr(limits(), create);
    const pending = ocr.recognize(Buffer.from('image'));
    const rejected = expect(pending).rejects.toMatchObject({
      code: 'OCR_TIMEOUT',
    });

    await jest.advanceTimersByTimeAsync(600);
    expect(active.recognize).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(400);
    await rejected;
    expect(active.terminate).toHaveBeenCalledTimes(1);
  });

  test('a late worker cannot replace a healthy worker from a later attempt', async () => {
    const late = worker();
    const healthy = worker();
    let initialize!: (value: typeof late) => void;
    const create = jest
      .fn<() => Promise<typeof late>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            initialize = resolve;
          }),
      )
      .mockResolvedValue(healthy);

    const ocr = new LocalOcr(limits(), create);
    const pending = ocr.recognize(Buffer.from('first'));
    const rejected = expect(pending).rejects.toMatchObject({
      code: 'OCR_TIMEOUT',
    });

    await jest.advanceTimersByTimeAsync(1000);
    await rejected;
    await expect(ocr.recognize(Buffer.from('second'))).resolves.toEqual(result);
    initialize(late);
    await jest.advanceTimersByTimeAsync(0);
    await expect(ocr.recognize(Buffer.from('third'))).resolves.toEqual(result);
    expect(create).toHaveBeenCalledTimes(2);
    expect(late.terminate).toHaveBeenCalledTimes(1);
    expect(late.recognize).not.toHaveBeenCalled();
    expect(healthy.recognize).toHaveBeenCalledTimes(2);
    expect(healthy.terminate).not.toHaveBeenCalled();
    await ocr.close();
    expect(healthy.terminate).toHaveBeenCalledTimes(1);
  });

  test('bounds parameter initialization before starting recognition', async () => {
    const active = worker();
    active.setParameters.mockImplementation(() => new Promise(() => {}));
    const ocr = new LocalOcr(limits(), () => Promise.resolve(active));
    const pending = ocr.recognize(Buffer.from('image'));
    const rejected = expect(pending).rejects.toMatchObject({
      code: 'OCR_TIMEOUT',
    });

    await jest.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(active.recognize).not.toHaveBeenCalled();
    expect(active.terminate).toHaveBeenCalledTimes(1);
  });

  test('reuses a healthy worker and cancels successful-operation timers', async () => {
    const active = worker();
    const create = jest.fn(() => Promise.resolve(active));
    const ocr = new LocalOcr(limits(), create);
    await expect(ocr.recognize(Buffer.from('first'))).resolves.toEqual(result);
    await expect(ocr.recognize(Buffer.from('second'))).resolves.toEqual(result);
    await jest.advanceTimersByTimeAsync(2000);
    expect(create).toHaveBeenCalledTimes(1);
    expect(active.recognize).toHaveBeenCalledTimes(2);
    expect(active.terminate).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    await ocr.close();
    expect(active.terminate).toHaveBeenCalledTimes(1);
  });
});
