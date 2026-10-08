// Explicit opt-in: this command sends synthetic fixtures to the configured model.
const assert = require('node:assert/strict');
const { readFile, writeFile } = require('node:fs/promises');
const { ConfigService } = require('@nestjs/config');
const { parse } = require('dotenv');
const { unzipSync } = require('fflate');
const {
  DocumentParserService,
  DocumentParserSettings,
  DOCUMENT_POLICY_VERSION,
} = require('../../dist/src/infra/document-parser');
const {
  OpenRouterMediaService,
} = require('../../dist/src/infra/model-gateway');
const { createVisualFixtures } = require('./visual-fixtures.cjs');

async function main() {
  assert.equal(
    process.argv[2],
    '--execute',
    'Supply --execute to authorize live fixture calls.',
  );
  const values = {};
  for (const path of ['../../.env', '.env']) {
    try {
      Object.assign(values, parse(await readFile(path)));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const providerKeys = [
    'BACKEND_MODEL_API_KEY',
    'BACKEND_MODEL_BASE_URL',
    'BACKEND_VISION_MODEL',
  ];
  const providerConfig = Object.fromEntries(
    providerKeys
      .map((key) => [key, process.env[key] || values[key]])
      .filter(([, value]) => value),
  );
  assert(
    providerConfig.BACKEND_MODEL_API_KEY,
    'Configure BACKEND_MODEL_API_KEY locally before running.',
  );
  const model =
    providerConfig.BACKEND_VISION_MODEL || 'google/gemini-2.5-flash';
  const media = new OpenRouterMediaService(new ConfigService(providerConfig));
  const parser = new DocumentParserService(
    new DocumentParserSettings(new ConfigService({})),
  );
  const fixtures = await createVisualFixtures();
  const nativeFetch = globalThis.fetch;
  const providerUsage = [];
  // Observe metadata without changing the production gateway or printing secrets/payloads.
  globalThis.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    if (response.ok) {
      const payload = await response.clone().json();
      const usage = payload.usage || {};
      providerUsage.push({
        model: payload.model || model,
        promptTokens: usage.prompt_tokens ?? null,
        completionTokens: usage.completion_tokens ?? null,
        cost: typeof usage.cost === 'number' ? usage.cost : null,
      });
    }
    return response;
  };
  const results = [];
  try {
    const parsed = await parser.parse({
      originalname: 'flowchart.pdf',
      mimetype: 'application/pdf',
      buffer: fixtures['flowchart.pdf'],
    });
    assert.equal(parsed.visuals.length, 1);
    const diagram = Buffer.from(
      unzipSync(fixtures['embedded-flowchart.docx'])['word/media/workflow.png'],
    );
    for (const [name, buffer, source, requiresInvoice] of [
      ['rendered-flowchart-page', parsed.visuals[0].buffer, 'Page 1', true],
      ['embedded-flowchart-image', diagram, 'Approval workflow', false],
    ]) {
      for (const operation of [
        'standalone-baseline',
        'document-interpretation',
      ]) {
        const started = Date.now();
        const text =
          operation === 'standalone-baseline'
            ? await media.describeImage(buffer, 'image/png')
            : await media.interpretDocumentImage(buffer, 'image/png', source);
        assert(text?.trim(), `${name}/${operation}: empty interpretation`);
        const checks = {
          managerLabel: /manager/i.test(text),
          financeLabel: /finance/i.test(text),
          ...(requiresInvoice
            ? {
                invoiceId: /SYD[-\s]?12345/i.test(text),
                amount: /125[.,\s]?000/.test(text),
              }
            : {}),
        };
        results.push({
          name,
          operation,
          durationMs: Date.now() - started,
          bytes: buffer.length,
          source,
          checks,
          interpretation: text,
        });
      }
    }
    const report = {
      generatedAt: new Date().toISOString(),
      model,
      policyVersion: DOCUMENT_POLICY_VERSION,
      syntheticFixturesOnly: true,
      providerCalls: providerUsage.length,
      providerUsage,
      passedFieldChecks: results.every((result) =>
        Object.values(result.checks).every(Boolean),
      ),
      directionReviewRequired: true,
      results,
    };
    if (process.argv[3])
      await writeFile(process.argv[3], JSON.stringify(report, null, 2) + '\n');
    process.stdout.write(
      JSON.stringify({
        model,
        providerCalls: providerUsage.length,
        passedFieldChecks: report.passedFieldChecks,
        output: process.argv[3] || null,
      }) + '\n',
    );
    assert(
      report.passedFieldChecks,
      'A model response lost a reviewed label or invoice field; inspect the saved synthetic report.',
    );
  } finally {
    globalThis.fetch = nativeFetch;
    await parser.onModuleDestroy();
  }
}

main().catch((error) => {
  process.stderr.write(
    `Live vision fixture check failed: ${error.name}: ${error.message}\n`,
  );
  process.exitCode = 1;
});
