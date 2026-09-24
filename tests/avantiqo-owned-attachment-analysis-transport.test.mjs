import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("owned attachment analysis preserves one bounded instruction on the local vision path", async () => {
  const analysis = await readFile(new URL("../lib/platform/runtime/ConversationAttachmentAnalysisRuntime.js", import.meta.url), "utf8");
  assert.match(analysis, /instruction: UNIVERSAL_VISUAL_ANALYSIS_INSTRUCTION/);
  assert.match(analysis, /owned_document_vision/);
  assert.match(analysis, /external_provider_fallback_allowed:\s*false/);
});

test("scanned PDF analysis remains owned and uses the certified renderer implementation", async () => {
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
});
