import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync("lib/operator/runtime/OperatorFastConversationRuntime.js", "utf8");

test("fast conversation imports the owned front cognition runtime it calls", () => {
  assert.match(runtime, /import \{ runOperatorFrontCognition \} from "\.\/OperatorFrontCognitionRuntime\.js";/);
  assert.match(runtime, /runOperatorFrontCognition\(\{/);
});

test("local front queue timeout degrades safely instead of throwing a Business Partner 500", () => {
  assert.match(runtime, /AVANTIQO_LOCAL_QUEUE_TIMEOUT/);
  assert.match(runtime, /if \(!fastIntelligenceTimeout\(error\)\) throw error;/);
  assert.match(runtime, /external_compute_started: false/);
  assert.match(runtime, /local_timeout: true/);
});
