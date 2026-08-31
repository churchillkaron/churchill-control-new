import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  zeroIdle: await readFile(
    "lib/code/runtime/CodeAIEmployeeZeroIdleFastStartRuntime.js",
    "utf8",
  ),
  operator: await readFile(
    "lib/operator/runtime/OperatorTurnRuntime.js",
    "utf8",
  ),
  provider: await readFile(
    "lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProvider.js",
    "utf8",
  ),
};

test("zero-idle Code mission returns a customer artifact", () => {
  assert.match(files.zeroIdle, /projectCodeAICustomerArtifact/);
  assert.match(files.zeroIdle, /customer_artifact: customerArtifact/);
  assert.match(files.zeroIdle, /SERVERLESS_ZERO_IDLE/);
});

test("Operator replaces generic Code response with the concrete artifact", () => {
  assert.match(files.operator, /findCodeAICustomerArtifact/);
  assert.match(files.operator, /renderCodeAICustomerArtifactText/);
  assert.match(files.operator, /code_customer_artifact_returned: true/);
  assert.match(files.operator, /response_text: responseText/);
});

test("zero-idle failed submission reaps capacity before preserving the error", () => {
  assert.match(files.provider, /reapAfterServerlessSubmissionFailure/);
  assert.match(files.provider, /await reapIdleCodeAIServerlessWorker\(\)/);
  assert.match(files.provider, /if \(zeroIdle\) await reapAfterServerlessSubmissionFailure\(error\)/);
  assert.match(files.provider, /throw error/);
});