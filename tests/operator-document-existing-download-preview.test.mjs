import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const downloadRoute = fs.readFileSync(new URL("../app/api/documents/[documentId]/download/route.js", import.meta.url), "utf8");
const libraryRuntime = fs.readFileSync(new URL("../lib/documents/runtime/DocumentLibraryRuntime.js", import.meta.url), "utf8");
const fastIndex = fs.readFileSync(new URL("../lib/operator/runtime/OperatorFastReadIndex.js", import.meta.url), "utf8");

test("controlled document preview reuses the existing document download endpoint", () => {
  assert.match(libraryRuntime, /\/api\/documents\/\$\{encodeURIComponent\(row\.id\)\}\/download/);
  assert.match(libraryRuntime, /redirect=1/);
  assert.match(libraryRuntime, /preview_url: previewUrl/);
  assert.match(libraryRuntime, /download_url: previewUrl/);
});

test("existing document download endpoint supports inline redirect and old versionNumber caller", () => {
  assert.match(downloadRoute, /url\.searchParams\.get\("versionNumber"\) \|\| url\.searchParams\.get\("version"\)/);
  assert.match(downloadRoute, /NextResponse\.redirect\(signed\.url, 307\)/);
  assert.match(downloadRoute, /recordDocumentAccess/);
});

test("Fast Documents read accepts library filters and quotations have a fast read", () => {
  assert.match(fastIndex, /queryFields:\["q","status","type","source","limit"\]/);
  assert.match(fastIndex, /commercial\.quotations\.read/);
  assert.match(fastIndex, /\/api\/commercial\/sales\/quotations/);
});
