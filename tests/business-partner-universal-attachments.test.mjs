import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Business Partner accepts universal binary attachments without decoding Excel as text", async () => {
  const [dock, runtime] = await Promise.all([
    read("components/operator/HomeAvantiqoIntelligenceDock.jsx"),
    read("lib/platform/runtime/ConversationAttachmentRuntime.js"),
  ]);
  assert.match(dock, /\/api\/operator\/attachments/);
  assert.match(dock, /\.pdf/);
  assert.match(dock, /\.xlsx/);
  assert.match(dock, /image\/\*/);
  assert.match(dock, /video\/\*/);
  assert.match(runtime, /CONTENT_ANALYSIS_REQUIRED/);
  assert.doesNotMatch(runtime, /"xlsx"/);
});
test("attachment context is organization scoped and never authorization", async () => {
  const [turn, synthetic] = await Promise.all([
    read("app/api/operator/turn/route.js"),
    read("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js"),
  ]);
  assert.match(turn, /conversationAttachmentSetIdFromRequest/);
  assert.match(turn, /loadConversationAttachmentSet/);
  assert.match(turn, /conversationAttachments:\s*analyzedConversationAttachments/);
  assert.match(synthetic, /AVANTIQO_CURRENT_TURN_ATTACHMENT_CONTEXT_V1/);
  assert.match(synthetic, /authorization_effect=NONE/);
  assert.match(synthetic, /Do not infer document type from filename or MIME type alone/);
});

test("document vision economics remain measurement only until explicit activation", async () => {
  const source = await read("scripts/finalize-avantiqo-document-vision-economics.mjs");
  assert.match(source, /PENDING_EXPLICIT_ACTIVATION/);
  assert.match(source, /pricing_activation_performed:\s*false/);
  assert.match(source, /MODAL_WORKSPACE_RATE_X_MEASURED_WORKER_SECONDS/);
});
