/** Real-model no-mutation regression using an authenticated isolated QA chat. */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const session = process.env.NOTES_CAPTURE_BROWSER_SESSION;
const message = process.env.NOTES_NON_RECORD_MESSAGE;
assert(
  session && message?.trim(),
  'Specify the QA session and non-recording message.',
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

async function main() {
  const url = new URL(browser('get', 'url'));
  assert(['localhost', '127.0.0.1'].includes(url.hostname));
  const conversationId = url.searchParams.get('conversation');
  assert(conversationId && url.pathname === '/', 'Open the existing QA chat.');
  const read = `const {api}=await import('/src/lib/services/api/api.ts');
    const {getWorkspaceNote}=await import('/src/lib/services/api/notes/notes.api.ts');
    const workspace=(await api.get('/notes')).data.data;
    const documents=await Promise.all([...new Set(workspace.notes.map(x=>x.ref))].map(getWorkspaceNote));
    const conversation=(await api.get('/conversations/'+${JSON.stringify(conversationId)})).data.data;
    const work=(await api.get('/notes/organization/work')).data.data;
    return {workspace,documents,conversation,work};`;
  const before = evaluate(read);
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
  let after;
  let answer;
  while (Date.now() < deadline) {
    after = evaluate(read);
    answer = after.conversation.messages
      .slice(before.conversation.messages.length)
      .find((item) => item.role === 'assistant');
    if (answer) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert(
    answer,
    'Assistant has not completed; inspect this run before retrying.',
  );
  assert.deepEqual(
    after.documents,
    before.documents,
    'A non-recording turn must not change notes.',
  );
  assert.deepEqual(
    after.workspace,
    before.workspace,
    'A non-recording turn must not change the workspace.',
  );
  const source = after.conversation.messages
    .slice(before.conversation.messages.length)
    .find((item) => item.role === 'user' && item.content === message);
  assert(source, 'Expected source message was not accepted.');
  const work = after.work.find(
    (item) => item.stage === 'source' && item.sourceRef === source.id,
  );
  assert(work, 'Background eligibility needs durable source evidence.');
  evaluate(`const {api}=await import('/src/lib/services/api/api.ts');
    window.nonRecordingReview={status:'running'};
    api.post('/notes/organization/review',{mode:'apply',sourceWorkId:${JSON.stringify(work.id)}},{timeout:150000})
      .then(r=>window.nonRecordingReview={status:'done',value:r.data.data},
        e=>window.nonRecordingReview={status:'failed',error:e.message});
    return true;`);
  const reviewDeadline = Date.now() + 160000;
  let review;
  while (Date.now() < reviewDeadline) {
    review = evaluate('return window.nonRecordingReview;');
    if (review.status !== 'running') break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(review.status, 'done', JSON.stringify(review));
  assert.equal(review.value.failed, 0, 'Background review failed.');
  after = evaluate(read);
  assert.deepEqual(
    after.documents,
    before.documents,
    'Background must not promote a question or hypothetical into a record.',
  );
  assert.deepEqual(after.workspace, before.workspace);
  for (const question of before.work.filter(
    (item) => item.status === 'needs_clarification',
  )) {
    assert.equal(
      after.work.find((item) => item.id === question.id)?.status,
      'needs_clarification',
    );
  }
  if (process.env.NOTES_EXPECTED_ANSWER_TEXT) {
    assert(
      answer.content.includes(process.env.NOTES_EXPECTED_ANSWER_TEXT),
      'Answer must use the current stored fact.',
    );
  }
  console.log(
    JSON.stringify({
      passed: true,
      message,
      sourceMessageId: source.id,
      answer: answer.content,
    }),
  );
}

main().catch((error) => {
  console.error(error.name, error.message);
  process.exitCode = 1;
});
