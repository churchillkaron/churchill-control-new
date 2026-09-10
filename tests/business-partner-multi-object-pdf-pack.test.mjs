import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { splitPdfPages, validateDistinctPdfObjectSpans } from "../lib/documents/runtime/PdfPageSplitRuntime.js";
import { resolvePreparedAttachmentReflex, hasPreparedAttachmentReflexCandidate } from "../lib/operator/runtime/OperatorPreparedAttachmentReflex.js";

async function threePagePdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 200]); pdf.addPage([200, 200]); pdf.addPage([200, 200]);
  return Buffer.from(await pdf.save());
}

test("PDF splitter copies only requested source pages", async () => {
  const source = await threePagePdf();
  const split = await splitPdfPages({ bytes: source, pageNumbers: [3, 1], filename: "pack.pdf" });
  const result = await PDFDocument.load(split.bytes);
  assert.equal(result.getPageCount(), 2);
  assert.deepEqual(split.page_numbers, [1, 3]);
  assert.equal(split.source_page_count, 3);
});

test("pack page spans must not overlap", () => {
  assert.throws(() => validateDistinctPdfObjectSpans([{ page_numbers: [1,2] }, { page_numbers: [2,3] }]), /PDF_SPLIT_OVERLAPPING_PAGE:2/);
});

function logical(id, pages, type, domain, number = null) {
  return {
    id: "file_1", attachment_set_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", name: "pack.pdf", mime_type: "application/pdf", logical_object_id: id, logical_object_count: 2,
    evidence_span: { pages }, analysis: { status: "ANALYZED", evidence: { object_type: type, document_type: type, key_fields: { document_number: number } } },
    business_match: { status: "NO_MATCH", candidates: [] },
    prepared_candidate: { type: "universal_destination", status: "DESTINATION_RESOLVED", destination: { domain_id: domain, domain, route: `/${domain}` }, evidence_classification: { object_type: type } },
  };
}

test("one physical multi-object PDF stages one controlled split-pack action", () => {
  const attachments = [logical("contract_1", [1,2], "contract", "documents", "C-1"), logical("certificate_1", [3], "certificate", "people", "CERT-1")];
  const capabilities = [{ key: "documents.files.createPack" }];
  assert.equal(hasPreparedAttachmentReflexCandidate(attachments, "file this pack"), true);
  const result = resolvePreparedAttachmentReflex({ message: "file this pack", attachments, capabilities });
  assert.equal(result.execution.capability_key, "documents.files.createPack");
  assert.deepEqual(result.execution.payload.objects[0].page_numbers, [1,2]);
  assert.deepEqual(result.execution.payload.objects[1].page_numbers, [3]);
  assert.equal(result.intent, "execute");
});
