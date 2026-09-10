import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(new URL("../lib/operator/runtime/OperatorFastConversationRuntime.js", import.meta.url), "utf8");

test("Fast evidence cannot claim a preview when no real artifact was returned", () => {
  assert.match(runtime, /ARTIFACT_REQUEST_PATTERN/);
  assert.match(runtime, /ARTIFACT_CLAIM_PATTERN/);
  assert.match(runtime, /presentationArtifactCount/);
  assert.match(runtime, /guardFastArtifactPresentationClaim/);
  assert.match(runtime, /it did not return a previewable file/);
  assert.match(runtime, /response_text: presentedResponseText/);
});

test("Fast evidence carries real presentation artifacts before allowing preview claims", () => {
  assert.match(runtime, /presentation_artifacts/);
  assert.match(runtime, /liveReadReceipts/);
  assert.match(runtime, /presentationArtifactCount\(receipts\) > 0/);
});
