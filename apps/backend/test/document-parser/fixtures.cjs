const { PDFDocument, StandardFonts } = require('pdf-lib');
const { createCanvas } = require('@napi-rs/canvas');
const { zipSync, strToU8 } = require('fflate');
const { mkdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');

const FACT = 'Invoice SYD-12345 Total Rp 125.000';
const xml = (content) => `<?xml version="1.0" encoding="UTF-8"?>${content}`;
const zip = (files) =>
  Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries(files).map(([name, value]) => [name, strToU8(value)]),
      ),
    ),
  );
const types = (part, mime) =>
  xml(
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/${part}" ContentType="${mime}"/></Types>`,
  );
const rels = (type, target) =>
  xml(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/></Relationships>`,
  );

async function createFixtures(directory) {
  await mkdir(directory, { recursive: true });
  const files = {
    'invoice.txt': FACT,
    'invoice.json': JSON.stringify({
      invoice: 'SYD-12345',
      total: 'Rp 125.000',
    }),
    'invoice.md': `# Invoice\n\n| Number | Total |\n| --- | --- |\n| SYD-12345 | Rp 125.000 |`,
    'invoice.html': `<h1>Invoice</h1><table><tr><th>Number</th><th>Total</th></tr><tr><td>SYD-12345</td><td>Rp 125.000</td></tr></table><img src="https://invalid.example/never-fetch.png">`,
    'invoice.csv': 'Number,Total\nSYD-12345,Rp 125.000',
    'invoice.rtf': `{\\rtf1\\ansi ${FACT}}`,
    'invoice.docx': zip({
      '[Content_Types].xml': types(
        'word/document.xml',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
      ),
      '_rels/.rels': rels('officeDocument', 'word/document.xml'),
      'word/document.xml': xml(
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${FACT}</w:t></w:r></w:p></w:body></w:document>`,
      ),
    }),
    'invoice.xlsx': zip({
      '[Content_Types].xml': types(
        'xl/workbook.xml',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
      ),
      '_rels/.rels': rels('officeDocument', 'xl/workbook.xml'),
      'xl/workbook.xml': xml(
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Invoices" sheetId="1" r:id="rId1"/></sheets></workbook>',
      ),
      'xl/_rels/workbook.xml.rels': rels('worksheet', 'worksheets/sheet1.xml'),
      'xl/worksheets/sheet1.xml': xml(
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Number</t></is></c><c r="B1" t="inlineStr"><is><t>Total</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>SYD-12345</t></is></c><c r="B2" t="inlineStr"><is><t>Rp 125.000</t></is></c></row></sheetData></worksheet>',
      ),
    }),
    'invoice.pptx': zip({
      '[Content_Types].xml': types(
        'ppt/presentation.xml',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
      ),
      '_rels/.rels': rels('officeDocument', 'ppt/presentation.xml'),
      'ppt/presentation.xml': xml(
        '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>',
      ),
      'ppt/_rels/presentation.xml.rels': rels('slide', 'slides/slide1.xml'),
      'ppt/slides/slide1.xml': xml(
        `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${FACT}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
      ),
    }),
  };
  const odf = (body) =>
    xml(
      `<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" office:version="1.2"><office:body>${body}</office:body></office:document-content>`,
    );
  files['invoice.odt'] = zip({
    mimetype: 'application/vnd.oasis.opendocument.text',
    'content.xml': odf(`<office:text><text:p>${FACT}</text:p></office:text>`),
  });
  files['invoice.ods'] = zip({
    mimetype: 'application/vnd.oasis.opendocument.spreadsheet',
    'content.xml': odf(
      '<office:spreadsheet><table:table table:name="Invoices"><table:table-row><table:table-cell office:value-type="string"><text:p>Number</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Total</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell office:value-type="string"><text:p>SYD-12345</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Rp 125.000</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet>',
    ),
  });
  files['invoice.odp'] = zip({
    mimetype: 'application/vnd.oasis.opendocument.presentation',
    'content.xml': odf(
      `<office:presentation><draw:page draw:name="Invoice"><draw:frame><draw:text-box><text:p>${FACT}</text:p></draw:text-box></draw:frame></draw:page></office:presentation>`,
    ),
  });

  const digital = await PDFDocument.create();
  const font = await digital.embedFont(StandardFonts.Helvetica);
  digital.addPage([600, 800]).drawText(FACT, { x: 40, y: 700, size: 18, font });
  digital.addPage([600, 800]).drawText('Second page Reference SYD-67890', {
    x: 40,
    y: 700,
    size: 18,
    font,
  });
  files['digital.pdf'] = Buffer.from(await digital.save());

  const canvas = createCanvas(1200, 1600);
  const context = canvas.getContext('2d');
  context.fillStyle = 'white';
  context.fillRect(0, 0, 1200, 1600);
  context.fillStyle = 'black';
  context.font = '40px sans-serif';
  [
    'Invoice nomor SYD-67890',
    'Nama Pelanggan: Sydia',
    'Total Rp 250.000',
    'Due date: 06/10/2026',
  ].forEach((line, index) => context.fillText(line, 80, 160 + index * 80));
  files['scan.png'] = canvas.toBuffer('image/png');
  const mixed = await PDFDocument.load(files['digital.pdf']);
  mixed.removePage(1);
  const image = await mixed.embedPng(files['scan.png']);
  mixed
    .addPage([600, 800])
    .drawImage(image, { x: 0, y: 0, width: 600, height: 800 });
  files['mixed.pdf'] = Buffer.from(await mixed.save());

  const columns = await PDFDocument.create();
  const columnFont = await columns.embedFont(StandardFonts.Helvetica);
  const columnPage = columns.addPage([600, 800]);
  ['Left heading', 'Order SYD-12345', 'Total Rp 125.000'].forEach(
    (text, index) =>
      columnPage.drawText(text, {
        x: 40,
        y: 700 - index * 30,
        font: columnFont,
        size: 12,
      }),
  );
  ['Right heading', 'Reference SYD-67890', 'Total Rp 250.000'].forEach(
    (text, index) =>
      columnPage.drawText(text, {
        x: 350,
        y: 700 - index * 30,
        font: columnFont,
        size: 12,
      }),
  );
  files['columns.pdf'] = Buffer.from(await columns.save());
  const largeTable = [
    '# Invoices',
    '',
    '| Number | Total |',
    '| --- | --- |',
    ...Array.from(
      { length: 100 },
      (_, index) => `| SYD-${String(index).padStart(5, '0')} | Rp 125.000 |`,
    ),
  ];
  files['table.md'] = largeTable.join('\n');

  await Promise.all(
    Object.entries(files).map(([name, data]) =>
      writeFile(join(directory, name), data),
    ),
  );
  return files;
}

module.exports = { createFixtures, FACT };
