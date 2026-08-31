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

test("Operator preserves Code artifacts when the cognitive guard blocks mutation", () => {
  assert.match(
    files.operator,
    /function withCodeCustomerArtifactReply\(result, artifactSource = result\)/,
  );
  assert.match(files.operator, /findCodeAICustomerArtifact\(artifactSource\)/);
  assert.match(files.operator, /withCodeCustomerArtifactReply\(guarded, result\)/);
  assert.match(files.operator, /code_customer_artifact_preserved_through_guard:/);
  assert.match(files.operator, /mutation_executed: false/);
});

test("zero-idle failed submission reaps capacity before preserving the error", () => {
  assert.match(files.provider, /reapAfterServerlessSubmissionFailure/);
  assert.match(files.provider, /await reapIdleCodeAIServerlessWorker\(\)/);
  assert.match(files.provider, /if \(zeroIdle\) await reapAfterServerlessSubmissionFailure\(error\)/);
  assert.match(files.provider, /throw error/);
});

test("completed Code jobs fail closed before billing when no deliverable result exists", () => {
  assert.match(files.provider, /AVANTIQO_CODE_DELIVERY_SETTLEMENT_GUARD_V1/);
  assert.match(files.provider, /guardCompletedDeliverable/);
  assert.match(files.provider, /AVANTIQO_CODE_SERVERLESS_COMPLETED_RESULT_REQUIRED/);
  assert.match(files.provider, /AVANTIQO_CODE_POD_COMPLETED_RESULT_REQUIRED/);
  assert.match(files.provider, /customer_charge_eligible: false/);
  assert.match(files.provider, /status: "failed"/);
});
