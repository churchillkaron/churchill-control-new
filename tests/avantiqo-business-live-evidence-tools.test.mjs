import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("operator intelligence bridge supports a read capability allow list",()=>{
  const s=fs.readFileSync("lib/operator/runtime/OperatorIntelligenceToolBridgeRuntime.js","utf8");
  assert.match(s,/allowedCapabilityKeys/);
  assert.match(s,/capabilityAllowed/);
});

test("business intelligence agent exposes only diagnosis-selected governed reads",()=>{
  const s=fs.readFileSync("lib/intelligence/runtime/BusinessIntelligenceAgentRuntime.js","utf8");
  assert.match(s,/selectedReadKeys/);
  assert.match(s,/allowedCapabilityKeys: selectedReadKeys/);
  assert.match(s,/business_live_internal_read_keys/);
  assert.match(s,/governedReadTools/);
});

test("business intelligence live reads remain authenticated and read only",()=>{
  const bridge=fs.readFileSync("lib/operator/runtime/OperatorIntelligenceToolBridgeRuntime.js","utf8");
  assert.match(bridge,/mutates: false/);
  assert.match(bridge,/approval_required: false/);
  assert.match(bridge,/scopedPayload/);
  assert.match(bridge,/callerRequest/);
  assert.match(bridge,/authorization_effect: "NONE"/);
});
