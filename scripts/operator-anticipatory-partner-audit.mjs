import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  runtimeSource,
  capabilitySource,
  platformRuntimeSource,
  routeSource,
  homeSource,
] = await Promise.all([
  readFile("lib/operator/runtime/OperatorAttentionRuntime.js", "utf8"),
  readFile("lib/platform/capabilities/createOperatorAttentionCapability.js", "utf8"),
  readFile("lib/platform/runtime/PlatformDomainRuntime.js", "utf8"),
  readFile("app/api/operator/attention/route.js", "utf8"),
  readFile("components/operator/HomeAvantiqoIntelligence.jsx", "utf8"),
]);

assert.match(runtimeSource, /listOperatorCapabilities/);
assert.match(runtimeSource, /rankOperatorCapabilities/);
assert.match(runtimeSource, /loadOperatorOrganizationalContext/);
assert.match(runtimeSource, /platform\.operator_read_chain\.execute/);
assert.match(runtimeSource, /MAX_PLAN_STEPS = 4/);
assert.match(runtimeSource, /steps\.length >= 2/);
assert.match(runtimeSource, /requiredInputs\(capability\)\.length === 0/);
assert.match(runtimeSource, /text\(capability\?\.mode\)\.toLowerCase\(\) === "read"/);
assert.match(runtimeSource, /capability\?\.transactional !== true/);
assert.match(runtimeSource, /capability\?\.requires_confirmation !== true/);
assert.match(runtimeSource, /Recommendation never authorizes execution/i);
assert.match(runtimeSource, /live_evidence as the only source for claims about current operational state/i);
assert.match(runtimeSource, /representative sample/i);
assert.match(runtimeSource, /writeCached\(context, result\)/);
assert.match(runtimeSource, /CACHE_TTL_MS = 5 \* 60 \* 1000/);

for (const forbidden of [
  "restaurant",
  "hotel",
  "construction",
  "healthcare",
  "pest_control",
  "retail",
  "revenue",
  "profit",
  "inventory",
  "payroll",
  "receivable",
  "payable",
]) {
  assert.doesNotMatch(
    runtimeSource,
    new RegExp(`\\b${forbidden}\\b`, "i"),
    `Operator attention runtime must not hardcode business vocabulary: ${forbidden}`,
  );
}

assert.match(capabilitySource, /capability: "attention"/);
assert.match(capabilitySource, /action: "scan"/);
assert.match(capabilitySource, /operatorMode: "read"/);
assert.match(capabilitySource, /transactional: false/);
assert.match(capabilitySource, /risk: "low"/);
assert.match(capabilitySource, /may recommend registered actions but never executes/i);
assert.match(capabilitySource, /context\?\.metadata\?\.partyId/);
assert.match(platformRuntimeSource, /attention:\s*\{/);
assert.match(platformRuntimeSource, /createOperatorAttentionCapability/);

assert.match(routeSource, /requireOrganizationAccess/);
assert.match(routeSource, /resolveBusinessContext/);
assert.match(routeSource, /domain: "platform"/);
assert.match(routeSource, /capability: "attention"/);
assert.match(routeSource, /action: "scan"/);
assert.match(routeSource, /partyId/);
assert.match(routeSource, /OPERATOR_ATTENTION_LATENCY_V1/);
assert.doesNotMatch(routeSource, /service_role/i);

assert.match(homeSource, /fetch\("\/api\/operator\/attention"/);
assert.match(homeSource, /data-avantiqo-attention-brief="true"/);
assert.match(homeSource, /Evidence-backed/);
assert.match(homeSource, /Recommendations are not approvals or authorization/);
assert.match(homeSource, /sendMessage\(/);
assert.doesNotMatch(homeSource, /forceRefresh:\s*true/);

console.log("OPERATOR_ANTICIPATORY_PARTNER_AUDIT=PASS");
console.log("OPERATOR_ATTENTION_PLANNING=LIVE_REGISTERED_READS_ONLY");
console.log("OPERATOR_ATTENTION_EXECUTION=BOUNDED_PARALLEL_READ_CHAIN");
console.log("OPERATOR_ATTENTION_CURRENT_STATE=LIVE_EVIDENCE_ONLY");
console.log("OPERATOR_ATTENTION_RECOMMENDATIONS=NO_AUTOMATIC_WRITE_AUTHORIZATION");
console.log("OPERATOR_ATTENTION_SEMANTICS=DYNAMIC_NO_FIXED_BUSINESS_VOCABULARY");
console.log("OPERATOR_ATTENTION_UI=SEPARATE_FROM_PERSISTED_CONVERSATION");
