import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const redirects = new Map([
  ["../app/(workforce)/workforce/page.jsx", "/staff"],
  ["../app/(workforce)/workforce/profile/page.jsx", "/staff/profile"],
  ["../app/(workforce)/workforce/my-day/page.jsx", "/staff/my-day"],
  ["../app/(workforce)/workforce/documents/page.jsx", "/staff/documents"],
  ["../app/(workforce)/workforce/payroll/page.jsx", "/staff/earnings"],
  ["../app/(workforce)/workforce/schedule/page.jsx", "/staff"],
  ["../app/(workforce)/workforce/tasks/page.jsx", "/staff/my-day"],
  ["../app/(workforce)/workforce/training/page.jsx", "/staff"],
  ["../app/(workforce)/workforce/upload/page.jsx", "/staff/documents/upload"],
]);

test("legacy Workforce self-service routes converge into canonical Staff Portal", () => {
  for (const [relative, target] of redirects) {
    const source = fs.readFileSync(new URL(relative, import.meta.url), "utf8");
    assert.match(source, /redirect/);
    assert.ok(source.includes(`redirect("${target}")`), `${relative} should redirect to ${target}`);
  }
});

const documents = fs.readFileSync(new URL("../app/(system)/staff/documents/page.jsx", import.meta.url), "utf8");
const upload = fs.readFileSync(new URL("../app/(system)/staff/documents/upload/page.jsx", import.meta.url), "utf8");
const passkeyEnrollment = fs.readFileSync(new URL("../app/api/people/workforce/passkey-enrollment/route.js", import.meta.url), "utf8");
const passkeyReadiness = fs.readFileSync(new URL("../app/(system)/workspace/[organizationId]/administration/passkey-readiness/page.jsx", import.meta.url), "utf8");

test("functional workforce upload is preserved under Staff Documents", () => {
  assert.match(documents, /href="\/staff\/documents\/upload"/);
  assert.match(upload, /\/api\/staff\/quick-upload/);
  assert.doesNotMatch(upload, /\/api\/assets\/upload-file/);
  assert.doesNotMatch(upload, /\/api\/intake\/classify/);
  assert.match(upload, /stored privately as a controlled staff document/);
});

test("passkey enrollment access returns directly to canonical Staff Profile", () => {
  assert.match(passkeyEnrollment, /\/staff\/profile/);
  assert.doesNotMatch(passkeyEnrollment, /\/workforce\/profile/);
  assert.match(passkeyReadiness, /https:\/\/avantiqo\.ai\/staff\/profile/);
  assert.doesNotMatch(passkeyReadiness, /https:\/\/avantiqo\.ai\/workforce\/profile/);
});
