import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { extractConversationAttachmentContent } from '../lib/platform/runtime/ConversationAttachmentRuntime.js';

async function docxBuffer() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Equipment inspection certificate ABC-123</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type:'nodebuffer' });
}

async function pptxBuffer() {
  const zip = new JSZip();
  zip.file('ppt/slides/slide2.xml', `<p:sld xmlns:p="x" xmlns:a="y"><a:t>Second slide project status</a:t></p:sld>`);
  zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="x" xmlns:a="y"><a:t>First slide customer proposal</a:t></p:sld>`);
  return zip.generateAsync({ type:'nodebuffer' });
}

test('DOCX text is extracted locally before owned semantic classification', async () => {
  const analysis = await extractConversationAttachmentContent({ name:'certificate.docx', buffer:await docxBuffer() });
  assert.equal(analysis.status, 'TEXT_EXTRACTED');
  assert.equal(analysis.structured_file_type, 'docx');
  assert.match(analysis.content_excerpt, /Equipment inspection certificate ABC-123/);
  assert.equal(analysis.requires_content_analysis, false);
});

test('PPTX slide text is extracted in slide order', async () => {
  const analysis = await extractConversationAttachmentContent({ name:'proposal.pptx', buffer:await pptxBuffer() });
  assert.equal(analysis.status, 'TEXT_EXTRACTED');
  assert.equal(analysis.structured_file_type, 'pptx');
  assert.match(analysis.content_excerpt, /^Slide 1: First slide customer proposal/);
  assert.match(analysis.content_excerpt, /Slide 2: Second slide project status/);
  assert.equal(analysis.slide_count, 2);
});

test('legacy binary Office formats remain fail closed', async () => {
  for (const name of ['legacy.doc','legacy.ppt','legacy.xls']) {
    const analysis = await extractConversationAttachmentContent({ name, buffer:Buffer.from([0xd0,0xcf,0x11,0xe0,1,2,3]) });
    assert.equal(analysis.status, 'CONTENT_ANALYSIS_REQUIRED');
    assert.equal(analysis.requires_content_analysis, true);
  }
});
