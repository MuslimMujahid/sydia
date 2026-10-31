/** Real-model browser regression. Requires an authenticated, isolated QA chat. */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const session = process.env.NOTES_CAPTURE_BROWSER_SESSION;
const ownerId = process.env.NOTES_CAPTURE_OWNER_ID;
const trackerRef = process.env.NOTES_CAPTURE_TRACKER_REF;
const amount = process.env.NOTES_CAPTURE_AMOUNT_IDR;
const expectedAmounts = process.env.NOTES_CAPTURE_EXPECTED_AMOUNTS
  ? JSON.parse(process.env.NOTES_CAPTURE_EXPECTED_AMOUNTS)
  : [amount];
const beforeAmounts = process.env.NOTES_CAPTURE_BEFORE_AMOUNTS
  ? JSON.parse(process.env.NOTES_CAPTURE_BEFORE_AMOUNTS)
  : null;
assert(
  Array.isArray(expectedAmounts) &&
    expectedAmounts.length &&
    expectedAmounts.every(
      (value) => typeof value === 'string' && /^[1-9][0-9]*$/.test(value),
    ),
  'Expected amounts must be a nonempty JSON array of whole-rupiah strings.',
);
const phase = process.env.NOTES_CAPTURE_PHASE ?? 'immediate';
assert(
  ['immediate', 'organized'].includes(phase),
  'Choose immediate or organized verification.',
);
const timezone = process.env.NOTES_CAPTURE_TIMEZONE;
assert(timezone, 'Specify the QA owner’s timezone.');
const localDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: timezone,
}).format(new Date());
assert(
  session && ownerId,
  'Specify the isolated browser session and QA owner.',
);
assert(
  /^custom:[a-zA-Z0-9_-]+$/.test(trackerRef ?? ''),
  'Specify the expense tracker reference.',
);
assert(
  /^[1-9][0-9]{2,8}$/.test(amount ?? ''),
  'Specify a fresh amount in whole rupiah.',
);

function browser(...args) {
  return execFileSync('agent-browser', ['--session', session, ...args], {
    encoding: 'utf8',
    timeout: 45000,
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
}
function evaluate(body) {
  return JSON.parse(
    execFileSync('agent-browser', ['--session', session, 'eval', '--stdin'], {
      input: `(async()=>{${body}})()`,
      encoding: 'utf8',
      timeout: 45000,
      maxBuffer: 8 * 1024 * 1024,
    }),
  );
}
function textNodes(node) {
  return typeof node.text === 'string'
    ? node.text
    : (node.content ?? []).map(textNodes).join(' ');
}
function matchingAmounts(note) {
  return (
    textNodes(note.content).replace(/[.,]/g, '').match(/\d+/g) ?? []
  ).filter((value) => value === amount).length;
}

function currencyAmounts(note) {
  return [...textNodes(note.content).matchAll(/(?:Rp|IDR)\s*([0-9.,]+)/g)].map(
    (match) => match[1].replace(/[.,]/g, ''),
  );
}
function noteLinks(node) {
  return [
    ...(node.type === 'noteLink' ? [JSON.stringify(node)] : []),
    ...(node.content ?? []).flatMap(noteLinks),
  ];
}

function markedText(node) {
  return [
    ...(node.type === 'text' && node.marks?.length
      ? [JSON.stringify(node)]
      : []),
    ...(node.content ?? []).flatMap(markedText),
  ];
}

async function organize(sourceWorkId) {
  evaluate(`const {api}=await import('/src/lib/services/api/api.ts');
    window.noteCaptureRegressionReview={status:'running'};
    api.post('/notes/organization/review',{mode:'apply',sourceWorkId:${JSON.stringify(sourceWorkId)}},{timeout:150000})
      .then(r=>window.noteCaptureRegressionReview={status:'done',value:r.data.data},
        e=>window.noteCaptureRegressionReview={status:'failed',error:e.message});
    return {started:true};`);
  const deadline = Date.now() + 160000;
  while (Date.now() < deadline) {
    const result = evaluate('return window.noteCaptureRegressionReview;');
    if (result.status === 'failed') throw new Error(result.error);
    if (result.status === 'done') return result.value;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    'Selected organization run still pending; inspect its state before retrying.',
  );
}

async function main() {
  browser(
    'wait',
    '--fn',
    `document.querySelector('[aria-label="Pesan untuk Sydia"]') !== null`,
  );
  const url = new URL(browser('get', 'url'));
  assert(
    ['localhost', '127.0.0.1'].includes(url.hostname),
    'Use the local development app.',
  );
  assert.equal(
    url.pathname,
    '/',
    'Open the QA chat before running the regression.',
  );
  const conversationId = url.searchParams.get('conversation');
  assert(conversationId, 'Open an existing QA conversation.');
  const conversationPath = `/conversations/${encodeURIComponent(conversationId)}`;
  const read = `const {api}=await import('/src/lib/services/api/api.ts');
    const {getWorkspaceNote}=await import('/src/lib/services/api/notes/notes.api.ts');
    const conversation=(await api.get(${JSON.stringify(conversationPath)})).data.data;
    const workspace=(await api.get('/notes')).data.data;
    const work=(await api.get('/notes/organization/work')).data.data;
    const documents=await Promise.all([...new Set(workspace.notes.map(x=>x.ref))].map(getWorkspaceNote));
    return {conversation,workspace,work,documents};`;
  const before = evaluate(read);
  assert(
    before.work.length > 0 &&
      before.work.every((item) => item.userId === ownerId),
    'Authenticated work must belong to the specified QA owner.',
  );
  assert.equal(before.conversation.conversation.id, conversationId);
  const target = before.documents.find((note) => note.ref === trackerRef);
  assert(target, 'The maintained expense tracker must already exist.');
  assert(
    textNodes(target.content).includes(localDay),
    'Use a fixture with today’s aggregate.',
  );
  if (beforeAmounts) {
    assert.deepEqual(
      currencyAmounts(target).sort(),
      [...beforeAmounts].sort(),
      'The starting tracker must match the stated fixture.',
    );
  } else {
    assert.equal(
      currencyAmounts(target).length,
      1,
      'Use an isolated tracker with one current-day aggregate.',
    );
    assert.equal(
      matchingAmounts(target),
      0,
      'Choose an amount not already in the tracker.',
    );
  }
  const message =
    process.env.NOTES_CAPTURE_MESSAGE ??
    `Pengeluaran saya hari ini Rp${Number(amount).toLocaleString('id-ID')}`;
  assert(message.trim(), 'The capture message must not be empty.');
  browser(
    'find',
    'role',
    'textbox',
    'fill',
    message,
    '--name',
    'Pesan untuk Sydia',
    '--exact',
  );
  browser(
    'find',
    'role',
    'button',
    'click',
    '--name',
    'Kirim pesan',
    '--exact',
  );

  const deadline = Date.now() + 120000;
  let newMessages;
  let completed = false;
  while (Date.now() < deadline) {
    const conversation = evaluate(
      `const {api}=await import('/src/lib/services/api/api.ts');return (await api.get(${JSON.stringify(conversationPath)})).data.data;`,
    );
    newMessages = conversation.messages.slice(
      before.conversation.messages.length,
    );
    if (newMessages.some((item) => item.role === 'assistant')) {
      completed = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert(
    completed,
    'The actual assistant run did not finish within the test deadline; inspect that run before retrying.',
  );
  const source = newMessages.find(
    (item) => item.role === 'user' && item.content === message,
  );
  assert(source, 'Expected source message was not accepted.');
  if (phase === 'organized') {
    const captured = evaluate(read);
    const sourceWork = captured.work.find(
      (item) => item.stage === 'source' && item.sourceRef === source.id,
    );
    assert(sourceWork, 'Immediate capture must leave durable source work.');
    const result = await organize(sourceWork.id);
    assert.equal(result.failed, 0, 'Organization run failed.');
    assert.equal(result.deferred, 0, 'Organization remains deferred.');
  }
  const after = evaluate(read);
  const changed = after.documents.filter(
    (note) =>
      JSON.stringify(note) !==
      JSON.stringify(before.documents.find((old) => old.ref === note.ref)),
  );
  const maintained = after.documents.find((note) => note.ref === trackerRef);
  if (phase === 'immediate') {
    assert.deepEqual(
      changed.map((note) => note.ref),
      [trackerRef],
      'Only the existing expense tracker should change.',
    );
  } else {
    assert(
      changed.some((note) => note.ref === trackerRef),
      'Organization must update the maintained tracker.',
    );
    assert(
      changed.every((note) =>
        [trackerRef, `daily:${localDay}`].includes(note.ref),
      ),
      'Unrelated notes must remain unchanged.',
    );
    const sourceWork = after.work.find(
      (item) => item.stage === 'source' && item.sourceRef === source.id,
    );
    assert.equal(
      sourceWork?.status,
      'applied',
      'Selected source must finish durably.',
    );
    const repeated = await organize(sourceWork.id);
    assert.equal(
      repeated.inspected,
      0,
      'Completed source should not run again.',
    );
    assert.deepEqual(
      evaluate(read).documents,
      after.documents,
      'A repeated scan must not change notes.',
    );
  }
  assert.deepEqual(
    after.workspace.items.map((item) => item.id).sort(),
    before.workspace.items.map((item) => item.id).sort(),
    'Do not create another home.',
  );
  assert.deepEqual(
    currencyAmounts(maintained).sort(),
    [...expectedAmounts].sort(),
    'Preserve the expected aggregate and distinct transaction amounts.',
  );
  for (const original of markedText(target.content)) {
    assert(
      markedText(maintained.content).includes(original),
      'Preserve unrelated marked text.',
    );
  }
  for (const link of noteLinks(target.content)) {
    assert(
      noteLinks(maintained.content).includes(link),
      'Preserve the existing note-link identities.',
    );
  }
  assert.equal(
    matchingAmounts(maintained),
    expectedAmounts.filter((value) => value === amount).length,
    'Retain the expected number of records for the reported amount.',
  );
  for (const question of before.work.filter(
    (item) => item.status === 'needs_clarification',
  )) {
    assert.equal(
      after.work.find((item) => item.id === question.id)?.status,
      'needs_clarification',
      'An unrelated report must not answer a pending question.',
    );
  }
  assert(
    after.work.some(
      (item) =>
        item.sourceRef === source.id &&
        item.stage === 'tool' &&
        item.status === 'applied' &&
        item.destinationRef === trackerRef,
    ),
    'Require a confirmed source-bound write receipt.',
  );
  console.log(
    JSON.stringify({
      passed: true,
      phase,
      sourceMessageId: source.id,
      trackerRef,
      version: maintained.version,
      unrelatedNotesUnchanged: true,
    }),
  );
}

main().catch((error) => {
  console.error(error.name, error.message);
  process.exitCode = 1;
});
