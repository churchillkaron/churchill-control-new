import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { inferredVerificationDeclaration } from "../lib/operator/runtime/OperatorCapabilityVerificationDeclaration.mjs";

function cap({ key, mode, input = {}, domain = "platform", capability = "secretary_deadline_coordination", action }) {
  return { key, domain, capability, action, mode, input_schema: { type: "object", properties: input } };
}

test("same-capability read with shared stable locator becomes canonical verifier", () => {
  const write = cap({ key:"platform.secretary_deadline_coordination.cancel", action:"cancel", mode:"write", input:{ deadline_id:{type:"string"}, reason:{type:"string"} } });
  const read = cap({ key:"platform.secretary_deadline_coordination.read", action:"read", mode:"read", input:{ deadline_id:{type:"string"}, deadline_key:{type:"string"} } });
  assert.deepEqual(inferredVerificationDeclaration(write, [write, read]), {
    capability_key: read.key,
    payload_keys: ["deadline_id"],
    derivation: "same_capability_registered_read_shared_locator",
  });
});

test("context fields and unrelated reads never become inferred verification", () => {
  const write = cap({ key:"platform.example.update", capability:"example", action:"update", mode:"write", input:{ customer_id:{type:"string"}, status:{type:"string"} } });
  const read = cap({ key:"platform.other.read", capability:"other", action:"read", mode:"read", input:{ customer_id:{type:"string"} } });
  assert.equal(inferredVerificationDeclaration(write, [write, read]), null);
});

test("same capability without shared locator remains fail closed", () => {
  const write = cap({ key:"platform.example.create", capability:"example", action:"create", mode:"write", input:{ name:{type:"string"} } });
  const read = cap({ key:"platform.example.read", capability:"example", action:"read", mode:"read", input:{ record_id:{type:"string"} } });
  assert.equal(inferredVerificationDeclaration(write, [write, read]), null);
});

test("Operator exposes verifier metadata and server fills missing staged verify_after", () => {
  const reasoning = fs.readFileSync("lib/operator/runtime/OperatorReasoningRuntime.js", "utf8");
  const verification = fs.readFileSync("lib/operator/runtime/OperatorVerificationRuntime.js", "utf8");
  assert.match(reasoning, /verification:\s*capability\.operator_verification/);
  assert.match(verification, /listOperatorCapabilities/);
  assert.match(verification, /Object\.fromEntries\(payloadKeys\.map/);
  assert.match(verification, /await supportedPendingExecution/);
  assert.match(verification, /catalog_declared_verification/);
});
