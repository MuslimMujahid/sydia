// Generate fixtures on the development host; runtime checks need no dev dependencies.
const assert = require('node:assert/strict');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { resolve, join } = require('node:path');
const { createFixtures } = require('./fixtures.cjs');
const { createVisualFixtures } = require('./visual-fixtures.cjs');
const { PDFDocument, StandardFonts } = require('pdf-lib');

async function main() {
  assert(process.argv[2], 'Supply an output directory for generated fixtures.');
  const root = resolve(process.argv[2]);
  const documents = join(root, 'documents');
  const visuals = join(root, 'visuals');
  await createFixtures(documents);
  const capacity = await PDFDocument.create();
  const font = await capacity.embedFont(StandardFonts.Helvetica);
  for (let number = 1; number <= 100; number++) {
    const page = capacity.addPage([595, 842]);
    page.drawText(
      `Capacity fixture page ${number}: Invoice SYD-CAPACITY-2026`,
      { x: 40, y: 790, size: 14, font },
    );
    for (let row = 0; row < 10; row++)
      page.drawText(
        `Row ${row + 1}: ordered native text, Total Rp 125.000, Reference ATLAS-7.`,
        { x: 40, y: 760 - row * 19, size: 10, font },
      );
  }
  await writeFile(join(documents, 'capacity.pdf'), await capacity.save());
  await writeFile(
    join(documents, 'encrypted.pdf'),
    Buffer.from(
      (await readFile(join(__dirname, 'encrypted-pdf.base64'), 'utf8')).trim(),
      'base64',
    ),
  );
  await mkdir(visuals, { recursive: true });
  const files = await createVisualFixtures();
  await Promise.all(
    Object.entries(files).map(([name, buffer]) =>
      writeFile(join(visuals, name), buffer),
    ),
  );
  process.stdout.write(JSON.stringify({ documents, visuals }) + '\n');
}

main().catch((error) => {
  process.stderr.write(`Fixture generation failed: ${error.message}\n`);
  process.exitCode = 1;
});
