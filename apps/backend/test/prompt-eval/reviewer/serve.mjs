import { fileURLToPath } from 'node:url';
import page from './index.html';
import { LATEST_REPORT } from './prompt-eval-report.ts';
import { readPromptEvalReview } from './prompt-eval-reports.server.ts';

const directory = fileURLToPath(new URL('../', import.meta.url));

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 4175,
  development: false,
  routes: {
    '/': page,
    '/api/reports': {
      async GET(request) {
        const id =
          new URL(request.url).searchParams.get('report') ?? LATEST_REPORT;

        return Response.json(await readPromptEvalReview(directory, id), {
          headers: { 'Cache-Control': 'no-store' },
        });
      },
    },
  },
  error(error) {
    console.error('[prompt-evals] Could not serve the reviewer', error);

    return new Response(
      'Could not load saved eval reports. Check the terminal.',
      { status: 500 },
    );
  },
});

console.info(`Prompt eval reviewer: ${server.url}`);
