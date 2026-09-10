import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const attachmentRuntime = fs.readFileSync("lib/platform/runtime/ConversationAttachmentRuntime.js", "utf8");
const analysisRuntime = fs.readFileSync("lib/platform/runtime/ConversationAttachmentAnalysisRuntime.js", "utf8");
const turnRoute = fs.readFileSync("app/api/operator/turn/route.js", "utf8");

test("attachment analysis cache is ephemeral and scope bound", () => {
  assert.match(attachmentRuntime, /persistConversationAttachmentAnalysis/);
  assert.match(attachmentRuntime, /\.eq\("organization_id", orgId\)/);
  assert.match(attachmentRuntime, /memoryKey\(actor, setId\)/);
  assert.match(attachmentRuntime, /ATTACHMENT_SET_SCOPE_MISMATCH/);
  assert.match(attachmentRuntime, /expiresAt <= Date\.now\(\)/);
  assert.match(attachmentRuntime, /authorization_effect: "NONE"/);
});

test("cache only accepts successful versioned analysis for the exact file bytes", () => {
  assert.match(attachmentRuntime, /object\(file\.analysis\)\.status === "ANALYZED"/);
  assert.match(attachmentRuntime, /file\.analysis\.analysis_version/);
  assert.match(attachmentRuntime, /source\.id.*source\.sha256/);
  assert.match(analysisRuntime, /AVANTIQO_BUSINESS_PARTNER_ATTACHMENT_ANALYSIS_V2/);
});
test("current-version analysis is reused while stale analysis is reprocessed", () => {
  assert.match(analysisRuntime, /currentAnalysis\(file\)/);
  assert.match(analysisRuntime, /analysis\.analysis_version === AVANTIQO_ATTACHMENT_ANALYSIS_VERSION/);
  assert.match(analysisRuntime, /staleAnalyzed/);
  assert.match(analysisRuntime, /preservedExtractedContent/);
});

test("turn caches semantic evidence before destination preparation", () => {
  const blockStart = turnRoute.indexOf("const analyzedConversationAttachments");
  const executionBlock = turnRoute.slice(blockStart);
  const analyzeIndex = executionBlock.indexOf("analyzeConversationAttachments({");
  const cacheIndex = executionBlock.indexOf("persistConversationAttachmentAnalysis({");
  const prepareIndex = executionBlock.indexOf("prepareBankStatementAttachment({");
  assert.ok(blockStart >= 0 && analyzeIndex >= 0 && cacheIndex > analyzeIndex && prepareIndex > cacheIndex);
  assert.match(executionBlock, /OPERATOR_ATTACHMENT_ANALYSIS_CACHE_FAILED/);
});

test("cache persistence failure does not become business execution authority", () => {
  assert.match(turnRoute, /catch \(cacheError\)/);
  assert.doesNotMatch(attachmentRuntime, /customer_invoices|bank_statements|journal_entries|vendor_payments/);
});
