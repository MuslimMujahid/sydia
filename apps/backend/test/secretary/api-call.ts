import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

/**
 * Authenticated QA call through the normal API, standing in for a second
 * browser tab (for example, creating a calendar event during SCHED-09).
 * Usage: bun run test/secretary/api-call.ts <manifest> <METHOD> <path> [jsonBody]
 */
async function main(): Promise<void> {
  const [manifestPath, method, path, body] = process.argv.slice(2);
  if (!manifestPath || !method || !path)
    throw new Error('Usage: api-call.ts <manifest> <METHOD> <path> [jsonBody]');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    accounts: Array<{ email: string }>;
    password: string;
  };

  const account =
    manifest.accounts[Number(process.env.SECRETARY_QA_ACCOUNT ?? 0)];

  if (!account || !/^secretary-qa-.*@example\.test$/.test(account.email))
    throw new Error(
      'This helper only accepts a secretary QA account manifest.',
    );
  const origin = process.env.SECRETARY_QA_API ?? 'http://localhost:5000';
  const signIn = await fetch(`${origin}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost:3000',
    },
    body: JSON.stringify({ email: account.email, password: manifest.password }),
  });

  if (!signIn.ok) throw new Error(`Sign-in failed: ${signIn.status}`);
  const cookie = signIn.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');

  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      cookie,
      'idempotency-key': randomUUID(),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body } : {}),
  });

  console.log(response.status, (await response.text()).slice(0, 1500));
  if (!response.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
