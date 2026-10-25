import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an object response.');

  return value as Record<string, unknown>;
}

async function main(): Promise<void> {
  const manifestPath = process.argv[2];
  const content = process.argv[3];
  if (!manifestPath || !content)
    throw new Error(
      'Usage: bun run test/secretary/run-prompt.ts <manifest.json> <prompt> [conversationId]',
    );
  const manifest = object(
    JSON.parse(await readFile(manifestPath, 'utf8')) as unknown,
  );

  if (!Array.isArray(manifest.accounts))
    throw new Error('Missing QA accounts.');
  const account = object(
    manifest.accounts[Number(process.env.SECRETARY_QA_ACCOUNT ?? 0)],
  );

  if (
    typeof account.email !== 'string' ||
    !/^secretary-qa-.*@example\.test$/.test(account.email) ||
    typeof manifest.password !== 'string'
  )
    throw new Error(
      'This runner only accepts a secretary QA account manifest.',
    );
  const origin = process.env.SECRETARY_QA_API ?? 'http://localhost:5000';
  const response = await fetch(`${origin}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost:3000',
    },
    body: JSON.stringify({ email: account.email, password: manifest.password }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) throw new Error(`Sign-in failed: ${response.status}.`);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');

  if (!cookie) throw new Error('No QA session cookie.');
  let result: Record<string, unknown>;

  if (content === '--inspect' || content === '--retry') {
    if (!process.argv[4])
      throw new Error('Inspection requires an existing conversation ID.');
    const response = await fetch(`${origin}/conversations/${process.argv[4]}`, {
      headers: { cookie },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) throw new Error(`Inspection failed: ${response.status}`);
    const detail = object(object(await response.json()).data);
    if (!Array.isArray(detail.assistantRuns) || !detail.assistantRuns.length)
      throw new Error('No assistant run to inspect.');
    const latest = detail.assistantRuns
      .map(object)
      .sort((a, b) =>
        String(b.createdAt).localeCompare(String(a.createdAt)),
      )[0];

    if (!latest) throw new Error('No current assistant run to inspect.');

    if (content === '--retry') {
      const retry = await fetch(
        `${origin}/conversations/${process.argv[4]}/runs/${String(latest.id)}/retry`,
        {
          method: 'POST',
          headers: { cookie },
          signal: AbortSignal.timeout(30_000),
        },
      );

      if (!retry.ok) throw new Error(`Run retry failed: ${retry.status}.`);
      result = object(object(await retry.json()).data);
      if (object(result.assistantRun).id !== latest.id)
        throw new Error('Retry unexpectedly changed the run identity.');
    } else result = { assistantRun: latest, conversation: detail.conversation };
  } else {
    const request = {
      content,
      // A replay harness may reuse an earlier request identity (transport retry).
      idempotencyKey: process.env.SECRETARY_QA_IDEMPOTENCY ?? randomUUID(),
      ...(process.argv[4] ? { conversationId: process.argv[4] } : {}),
    };

    await writeFile(
      resolve(dirname(manifestPath), `request-${request.idempotencyKey}.json`),
      JSON.stringify({ account: account.email, request }, null, 2),
      { mode: 0o600 },
    );
    const send = await fetch(`${origin}/conversations/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    });

    if (!send.ok)
      throw new Error(`Send failed: ${send.status} ${await send.text()}`);
    result = object(object(await send.json()).data);
  }

  const run = object(result.assistantRun);
  const conversation = object(result.conversation);
  const deadline = Date.now() + 240_000;

  while (Date.now() < deadline) {
    let detailResponse: Response;

    try {
      detailResponse = await fetch(
        `${origin}/conversations/${String(conversation.id)}`,
        { headers: { cookie }, signal: AbortSignal.timeout(30_000) },
      );
    } catch (error: unknown) {
      console.warn(
        `Observation of existing run ${String(run.id)} was interrupted; continuing within the same deadline.`,
        error instanceof Error ? error.name : 'UnknownError',
      );
      await delay(1000);
      continue;
    }

    if (!detailResponse.ok)
      throw new Error(`Run inspection failed: ${detailResponse.status}.`);
    const detail = object(object(await detailResponse.json()).data);
    if (!Array.isArray(detail.assistantRuns) || !Array.isArray(detail.messages))
      throw new Error('Malformed conversation detail.');
    const current = detail.assistantRuns
      .map(object)
      .find((item) => item.id === run.id);

    if (current && ['completed', 'failed'].includes(String(current.status))) {
      const answer = detail.messages
        .map(object)
        .find((item) => item.id === current.assistantMessageId);

      const artifact = {
        capturedAt: new Date().toISOString(),
        account: account.email,
        prompt:
          content === '--inspect' || content === '--retry'
            ? detail.messages
                .map(object)
                .filter((item) => item.role === 'user')
                .at(-1)?.content
            : content,
        inspectedExistingRun: content === '--inspect',
        retriedExistingRun: content === '--retry',
        conversationId: conversation.id,
        run: current,
        answer: answer?.content,
        detail,
      };

      const output = resolve(
        dirname(manifestPath),
        content === '--retry'
          ? `retry-${String(run.id)}-${Date.now()}.json`
          : `prompt-${String(run.id)}.json`,
      );

      await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, {
        mode: 0o600,
      });
      console.log(
        JSON.stringify(
          {
            status: current.status,
            conversationId: conversation.id,
            answer: answer?.content,
            artifact: output,
          },
          null,
          2,
        ),
      );
      if (current.status === 'failed')
        throw new Error(
          `Assistant run failed: ${String(current.errorMessage)}.`,
        );

      return;
    }

    await delay(1000);
  }

  throw new Error(
    `Assistant run ${String(run.id)} did not reach a terminal state within 240 seconds.`,
  );
}

main().catch((error: unknown) => {
  console.error('Secretary prompt run failed.', error);
  process.exitCode = 1;
});
