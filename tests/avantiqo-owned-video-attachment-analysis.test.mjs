import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("lib/platform/runtime/BusinessPartnerVideoAttachmentAnalysisRuntime.js", "utf8");
const attachment = fs.readFileSync("lib/platform/runtime/ConversationAttachmentAnalysisRuntime.js", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

test("video upload analysis is an owned multimodal pipeline", () => {
  assert.match(runtime, /capability:\s*"ai\.image\.analyze"/);
  assert.match(runtime, /capability:\s*"ai\.speech\.to\.text"/);
  assert.match(runtime, /capability:\s*"ai\.text\.generate"/);
  assert.match(runtime, /owned_only_required:\s*true/g);
  assert.match(runtime, /external_provider_fallback_allowed:\s*false/g);
  assert.match(runtime, /capability:\s*"ai\.video\.analyze"/);
});

test("video sampling is portable and temporary", () => {
  assert.ok(pkg.dependencies?.["ffmpeg-static"]);
  assert.match(runtime, /ffmpegStatic/);
  assert.match(runtime, /FRAME_LIMIT = 6/);
  assert.match(runtime, /operator-video-analysis/);
  assert.match(runtime, /cleanupFrames\(temporaryFrames\)/);
  assert.match(runtime, /fs\.rm\(directory, \{ recursive: true, force: true \}\)/);
});
test("video intake never authorizes a business mutation", () => {
  assert.match(runtime, /authorization_effect:\s*"NONE"/g);
  assert.doesNotMatch(runtime, /from\("customer_invoices"\)|from\("bank_statements"\)|\.insert\(|\.update\(/);
});

test("video attachments no longer fall through as unsupported", () => {
  assert.match(attachment, /function videoAttachment/);
  assert.match(attachment, /analyzeBusinessPartnerVideoAttachment\(\{ file, context \}\)/);
  const videoBranch = attachment.indexOf("if (videoAttachment(file))");
  const unsupportedBranch = attachment.indexOf("if (!ownedVisionFile(file))");
  assert.ok(videoBranch >= 0 && unsupportedBranch > videoBranch);
});

test("video semantics are evidence merged, not MIME classified", () => {
  assert.match(runtime, /VISUAL_EVIDENCE=/);
  assert.match(runtime, /TRANSCRIPT=/);
  assert.match(runtime, /Do not infer identity, ownership, location, transaction, or business purpose/);
  assert.match(runtime, /clarification_required/);
});
