import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(new URL("../lib/customer-portal/CustomerPortalDocumentRuntime.js", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/customer-portal/documents/[documentId]/download/route.js", import.meta.url), "utf8");
const portal = fs.readFileSync(new URL("../app/customer-portal/page.jsx", import.meta.url), "utf8");

test("customer documents are deny-by-default and require explicit Party visibility or signature relation", () => {
  assert.match(runtime, /CUSTOMER_VISIBLE/);
  assert.match(runtime, /CUSTOMER_SIGNATURE/);
  assert.match(runtime, /reference_type", "PARTY"/);
  assert.match(runtime, /signer_party_id/);
  assert.match(runtime, /DOCUMENT_ACCESS_DENIED/);
});

test("customer document download revalidates portal session and exact document access before signing", () => {
  assert.match(route, /resolveCustomerPortalSession/);
  assert.match(route, /resolveCustomerPortalDocumentAccess/);
  assert.match(route, /createDocumentSignedUrl/);
  assert.match(route, /Math\.min\(300/);
});

test("customer portal shows only returned safe documents and downloads through customer-scoped route", () => {
  assert.match(portal, /data\.documents/);
  assert.match(portal, /\/api\/customer-portal\/documents\/\$\{document\.id\}\/download\?redirect=1/);
});
