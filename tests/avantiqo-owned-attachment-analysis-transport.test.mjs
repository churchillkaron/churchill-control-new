import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("owned attachment analysis preserves singular instruction through Modal transport", async () => {
  const source = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-owned/AvantiqoOwnedModalWorker.js", import.meta.url), "utf8");
  assert.match(source, /input\.instruction \|\| input\.provider_prompt/);
});

test("scanned PDF analysis stays inside owned Modal vision", async () => {
  const { readFile } = await import("node:fs/promises");
  const [analysis, handler, modalApp] = await Promise.all([
    readFile(new URL("../lib/platform/runtime/ConversationAttachmentAnalysisRuntime.js", import.meta.url), "utf8"),
    readFile(new URL("../services/avantiqo-image-engine/handler_v2.py", import.meta.url), "utf8"),
    readFile(new URL("../services/avantiqo-image-engine/modal_app.py", import.meta.url), "utf8"),
  ]);
  assert.match(analysis, /application\/pdf/);
  assert.match(analysis, /owned_document_vision/);
  assert.match(analysis, /external_provider_fallback_allowed:\s*false/);
  assert.match(handler, /fitz\.open/);
  assert.match(handler, /source_pages_rendered/);
  assert.match(modalApp, /pip_install\("pymupdf==1\.26\.4"\)/);
  assert.match(modalApp, /add_local_dir\(Path\(__file__\)\.parent/);
});
