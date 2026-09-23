import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const policy = fs.readFileSync(new URL("../lib/documents/security/DocumentReadAccessPolicy.js", import.meta.url), "utf8");
const download = fs.readFileSync(new URL("../app/api/documents/[documentId]/download/route.js", import.meta.url), "utf8");
const staffDocuments = fs.readFileSync(new URL("../app/api/staff/documents/route.js", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/(system)/staff/documents/page.jsx", import.meta.url), "utf8");

test("generic document download requires document-level authorization after organization authentication", () => {
  assert.match(download, /resolveAuthenticatedStaffContext/);
  assert.match(download, /resolveDocumentReadAccess/);
  assert.match(download, /Document access denied/);
  assert.match(download, /access_reason: documentAccess\.reason/);
  assert.match(download, /Math\.max\(60, Math\.min\(Math\.trunc\(requestedExpiry\), 900\)\)/);
});

test("ordinary staff document access requires explicit ownership, link or signer relationship", () => {
  assert.match(policy, /document\.owner_staff_id === staffId/);
  assert.match(policy, /enterprise_document_links/);
  assert.match(policy, /document_signature_requests/);
  assert.match(policy, /DOCUMENT_ACCESS_DENIED/);
});

test("my documents enumerates only personal relationships and returns a minimized browser payload", () => {
  assert.match(staffDocuments, /owner_staff_id/);
  assert.match(staffDocuments, /STAFF_REFERENCE_TYPES/);
  assert.match(staffDocuments, /PARTY_REFERENCE_TYPES/);
  assert.match(staffDocuments, /signer_party_id/);
  assert.doesNotMatch(staffDocuments, /select\("\*"\)/);
  assert.doesNotMatch(staffDocuments, /document_number,classification/);
  assert.doesNotMatch(staffDocuments, /entity_id,document_type/);
  assert.doesNotMatch(page, /organizationId/);
  assert.doesNotMatch(page, /document\.document_number/);
});

test("staff documents UI downloads through the secured canonical document route", () => {
  assert.match(page, /\/api\/staff\/documents/);
  assert.match(page, /\/api\/documents\/\$\{document\.id\}\/download/);
  assert.match(page, /redirect=1/);
});
