const enabled = process.env.WHATSAPP_HTTP_CONTRACT_ENABLED === 'true';
const baseUrl = process.env.BACKEND_AUTH_URL ?? 'http://localhost:5000';
const origin = 'http://localhost:3000';

type Session = { cookie: string; ownsAttempt: boolean; attemptId: string };
type Envelope<T> = { data: T };
type Qr = { attemptId: string; assetPath: string; expiresAt: string };

(enabled ? describe : describe.skip)(
  'WhatsApp authenticated HTTP contract',
  () => {
    let owner: Session;
    let other: Session;

    async function request(path: string, session?: Session, method = 'GET') {
      return fetch(new URL(path, baseUrl), {
        method,
        headers: { origin, ...(session ? { cookie: session.cookie } : {}) },
        signal: AbortSignal.timeout(35_000),
      });
    }

    async function signIn(email: string): Promise<Session> {
      const response = await fetch(
        new URL('/api/auth/sign-in/email', baseUrl),
        {
          method: 'POST',
          headers: { origin, 'content-type': 'application/json' },
          body: JSON.stringify({ email, password: 'Demo1234!' }),
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (response.status !== 200)
        throw new Error(`Seed sign-in failed with HTTP ${response.status}.`);
      const cookie = response.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');

      if (!cookie)
        throw new Error('Seed sign-in did not return session cookies.');

      return { cookie, ownsAttempt: false, attemptId: '' };
    }

    async function begin(session: Session) {
      const statusResponse = await request('/whatsapp/status', session);
      expect(statusResponse.status).toBe(200);
      const status = (await statusResponse.json()) as Envelope<{
        linked: boolean;
        assistantNumber: string | null;
      }>;

      if (status.data.linked || status.data.assistantNumber)
        throw new Error(
          'Refusing to change a seed account with a paired WhatsApp assistant.',
        );
      session.ownsAttempt = true;
      const response = await request('/whatsapp/companion/qr', session, 'POST');
      expect(response.status).toBe(201);
      expect(response.headers.get('cache-control')).toContain('no-store');
      const qr = (await response.json()) as Envelope<Qr>;
      expect(qr.data.attemptId).toEqual(expect.any(String));
      expect(qr.data.assetPath).toBe(
        `/whatsapp/companion/qr/${qr.data.attemptId}`,
      );
      session.attemptId = qr.data.attemptId;
    }

    beforeAll(async () => {
      if (
        !['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseUrl).hostname)
      )
        throw new Error(
          'This seed-account smoke only runs against a local development server.',
        );
      owner = await signIn('user@demo.com');
      other = await signIn('admin@demo.com');
      await begin(owner);
      await begin(other);
    }, 90_000);

    afterAll(async () => {
      const results = await Promise.allSettled(
        [owner, other]
          .filter((session) => session?.ownsAttempt)
          .map(async (session) => {
            const response = await request('/whatsapp/link', session, 'DELETE');
            expect(response.status).toBe(200);
            const result = (await response.json()) as Envelope<{
              cleanupPending: boolean;
            }>;

            expect(result.data.cleanupPending).toBe(false);
          }),
      );

      const failures = results.filter((result) => result.status === 'rejected');
      if (failures.length)
        throw new AggregateError(
          failures.map((result) => result.reason as unknown),
          'Temporary WhatsApp login cleanup failed.',
        );
    }, 45_000);

    test('anonymous callers cannot inspect status or begin login', async () => {
      expect((await request('/whatsapp/status')).status).toBe(401);
      expect(
        (await request('/whatsapp/companion/qr', undefined, 'POST')).status,
      ).toBe(401);
    });

    test('each authenticated account receives its own protected QR image', async () => {
      const response = await request(
        `/whatsapp/companion/qr/${owner.attemptId}`,
        owner,
      );

      expect(other.attemptId).not.toBe(owner.attemptId);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('image/png');
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(
        Array.from(new Uint8Array(await response.arrayBuffer()).slice(0, 8)),
      ).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    });

    test('another authenticated account cannot retrieve the owners QR', async () => {
      expect(
        (await request(`/whatsapp/companion/qr/${owner.attemptId}`, other))
          .status,
      ).toBe(404);
      expect(
        (await request(`/whatsapp/companion/qr/${other.attemptId}`, owner))
          .status,
      ).toBe(404);
      expect(
        (await request(`/whatsapp/companion/qr/${owner.attemptId}`)).status,
      ).toBe(401);
    });

    test('unpaired accounts cannot issue an owner challenge or use the retired pairing-code endpoint', async () => {
      expect((await request('/whatsapp/link-code', owner, 'POST')).status).toBe(
        409,
      );
      expect(
        (await request('/whatsapp/companion/pair-code', owner, 'POST')).status,
      ).toBe(404);
    });

    test('setup challenge requests share an atomic per-user abuse budget', async () => {
      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          request('/whatsapp/link-code', owner, 'POST'),
        ),
      );

      expect(
        responses.filter((response) => response.status === 409),
      ).toHaveLength(3);
      expect(
        responses.filter((response) => response.status === 429),
      ).toHaveLength(2);
      const blocked = responses.filter(
        (response) => response.status === 429,
      )[0]!;

      const result = (await blocked.json()) as {
        error: { code: string; details: { retryAfter: number } };
      };

      expect(result.error.code).toBe('TOO_MANY_REQUEST');
      expect(result.error.details.retryAfter).toBeGreaterThan(0);
    });

    test('caller-supplied user identifiers do not select another connection', async () => {
      expect((await request('/whatsapp/link', other, 'DELETE')).status).toBe(
        200,
      );
      const otherStatus = (await (
        await request('/whatsapp/status', other)
      ).json()) as Envelope<Record<string, unknown>>;

      expect(otherStatus.data.setupPhase).toBe('disconnected');

      const response = await request(
        '/whatsapp/status?userId=admin-user-seed&deviceId=not-this-user',
        owner,
      );

      const result = (await response.json()) as Envelope<
        Record<string, unknown>
      >;

      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(result.data).toMatchObject({
        linked: false,
        assistantNumber: null,
        ownerNumber: null,
      });
      expect(result.data.setupPhase).not.toBe(otherStatus.data.setupPhase);
      expect(result.data).not.toHaveProperty('deviceId');
      expect(result.data).not.toHaveProperty('ownerCodeHash');
      expect(result.data).not.toHaveProperty('qrAttemptId');
    });
  },
);
