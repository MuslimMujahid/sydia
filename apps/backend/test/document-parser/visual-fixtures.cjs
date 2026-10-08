const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { createCanvas } = require('@napi-rs/canvas');
const { zipSync, unzipSync, strToU8 } = require('fflate');

async function createVisualFixtures() {
  const files = {};
  async function pageFixture(name, draw) {
    const document = await PDFDocument.create();
    const page = document.addPage([612, 792]);
    const font = await document.embedFont(StandardFonts.Helvetica);
    page.drawText('Invoice SYD-12345 Total Rp 125.000', {
      x: 40,
      y: 740,
      size: 16,
      font,
    });
    await draw(page, font, document);
    files[name] = Buffer.from(await document.save());
  }
  await pageFixture('flowchart.pdf', async (page, font) => {
    for (const [x, label] of [
      [40, 'Manager'],
      [330, 'Finance'],
    ]) {
      page.drawRectangle({
        x,
        y: 550,
        width: 190,
        height: 90,
        borderColor: rgb(0, 0, 0),
        borderWidth: 2,
      });
      page.drawText(label, { x: x + 30, y: 588, font, size: 18 });
    }
    page.drawLine({
      start: { x: 230, y: 595 },
      end: { x: 330, y: 595 },
      thickness: 2,
    });
    page.drawLine({
      start: { x: 330, y: 595 },
      end: { x: 314, y: 604 },
      thickness: 2,
    });
    page.drawLine({
      start: { x: 330, y: 595 },
      end: { x: 314, y: 586 },
      thickness: 2,
    });
  });
  await pageFixture('bordered-table.pdf', async (page, font) => {
    for (let row = 0; row <= 12; row++) {
      const y = 680 - row * 35;
      page.drawLine({ start: { x: 40, y }, end: { x: 550, y }, thickness: 1 });
      if (row < 12)
        page.drawText(
          row
            ? `SYD-${String(row).padStart(5, '0')}    Rp 125.000`
            : 'Number                     Total',
          { x: 55, y: y - 24, size: 14, font },
        );
    }
    for (const x of [40, 295, 550])
      page.drawLine({ start: { x, y: 680 }, end: { x, y: 260 }, thickness: 1 });
  });
  await pageFixture('decorative-rule.pdf', async (page) => {
    page.drawRectangle({
      x: 40,
      y: 710,
      width: 500,
      height: 3,
      color: rgb(0.1, 0.4, 0.8),
    });
  });

  const canvas = createCanvas(900, 420);
  const context = canvas.getContext('2d');
  context.fillStyle = 'white';
  context.fillRect(0, 0, 900, 420);
  context.strokeStyle = '#111';
  context.lineWidth = 4;
  context.strokeRect(40, 120, 280, 150);
  context.strokeRect(580, 120, 280, 150);
  context.font = '34px sans-serif';
  context.fillStyle = '#111';
  context.fillText('Manager', 80, 200);
  context.fillText('Finance', 640, 200);
  context.beginPath();
  context.moveTo(320, 195);
  context.lineTo(580, 195);
  context.lineTo(550, 180);
  context.moveTo(580, 195);
  context.lineTo(550, 210);
  context.stroke();
  const graph = canvas.toBuffer('image/png');

  const xml = (value) => `<?xml version="1.0" encoding="UTF-8"?>${value}`;
  function officeImage(altText, repeats = 1) {
    const drawing = `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="5715000" cy="2667000"/><wp:docPr id="1" name="Workflow" descr="${altText}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="workflow.png" descr="${altText}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="5715000" cy="2667000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    const entries = {
      '[Content_Types].xml': xml(
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
      '_rels/.rels': xml(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDocument" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      ),
      'word/_rels/document.xml.rels': xml(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/workflow.png"/></Relationships>',
      ),
      'word/document.xml': xml(
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body><w:p><w:r><w:t>Invoice SYD-12345 Total Rp 125.000. Approval workflow below.</w:t></w:r></w:p>${drawing.repeat(repeats)}</w:body></w:document>`,
      ),
      'word/media/workflow.png': graph,
    };
    return Buffer.from(
      zipSync(
        Object.fromEntries(
          Object.entries(entries).map(([key, value]) => [
            key,
            Buffer.isBuffer(value) ? value : strToU8(value),
          ]),
        ),
      ),
    );
  }
  files['embedded-flowchart.docx'] = officeImage('Approval workflow');
  files['repeated-flowchart.docx'] = officeImage('Approval workflow', 2);
  files['decorative-logo.docx'] = officeImage('Company logo');
  const broken = unzipSync(officeImage('Approval workflow'));
  delete broken['word/media/workflow.png'];
  files['broken-flowchart.docx'] = Buffer.from(zipSync(broken));

  const abstract = createCanvas(800, 1000);
  const art = abstract.getContext('2d');
  art.fillStyle = '#d1d8e0';
  art.fillRect(0, 0, 800, 1000);
  for (let index = 0; index < 8; index++) {
    art.fillStyle = index % 2 ? '#667788' : '#998877';
    art.beginPath();
    art.arc(70 + index * 90, 150 + (index % 3) * 260, 65, 0, Math.PI * 2);
    art.fill();
  }
  const document = await PDFDocument.create();
  const raster = await document.embedPng(abstract.toBuffer('image/png'));
  document
    .addPage([612, 792])
    .drawImage(raster, { x: 0, y: 0, width: 612, height: 792 });
  files['unreadable-raster.pdf'] = Buffer.from(await document.save());
  return files;
}

module.exports = { createVisualFixtures };
