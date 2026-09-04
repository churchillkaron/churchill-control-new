import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../lib/operator/runtime/OperatorReasoningRuntime.js", import.meta.url),
  "utf8",
);
const failures = [];
const passes = [];

function check(name, condition, detail = "") {
  if (condition) passes.push(name);
  else failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}

const importMarker = "./OperatorVerifiedLearningContextRuntime.js";
const loadMarker = "const verifiedLearningContext = await loadOperatorVerifiedLearningContext({";
const requestMarker = "const request = {";
const fastRequestMarker = "const fastRequest = {";
const deepExecutionMarker = 'service_id: "ai.reasoning.execute"';

check("verified learning runtime is imported", source.includes(importMarker));
check("deep reasoning loads verified learning", source.includes(loadMarker));
check("deep request exposes bounded verified learning", source.includes("verified_platform_learning:"));
check("prompt marks learned context advisory only", source.includes("verified_platform_learning is platform-level reusable learned experience"));
check("prompt says learned context is not current business state", source.includes("not proof of current business state"));
check("prompt says learned context never authorizes action", source.includes("never authorization for an action"));
check("metadata records learning usage", source.includes("verified_platform_learning_used:"));
check("metadata records learning count", source.includes("verified_platform_learning_count:"));
check("metadata records learning contract", source.includes("verified_platform_learning_contract:"));
check("metadata records customer-private separation", source.includes("platform_learning_customer_private_memory_reused: false"));

const fastStart = source.indexOf(fastRequestMarker);
const loadStart = source.indexOf(loadMarker);
const requestStart = source.indexOf(requestMarker, loadStart);
const deepExecutionStart = source.indexOf(deepExecutionMarker, requestStart);
check("learning load occurs after fast request construction", fastStart >= 0 && loadStart > fastStart);
check("learning load occurs before deep request construction", loadStart >= 0 && requestStart > loadStart);
check("deep reasoning execution follows enriched request", deepExecutionStart > requestStart);

const fastBlock = fastStart >= 0 && loadStart > fastStart
  ? source.slice(fastStart, loadStart)
  : "";
check("fast path remains free of platform-learning retrieval", !fastBlock.includes("loadOperatorVerifiedLearningContext"));
check("fast request does not receive verified_platform_learning", !fastBlock.includes("verified_platform_learning"));

check("bridge context is bounded before injection", source.includes("knowledge: verifiedLearningContext.knowledge"));
check("query and bridge errors are not injected into model request", !source.includes("query: verifiedLearningContext.query"));
check("learned context does not alter capability catalog", !source.includes("capabilities: verifiedLearningContext"));

console.log("AVANTIQO_OPERATOR_VERIFIED_LEARNING_REASONING_INTEGRATION_AUDIT");
console.log(`CHECKS_PASSED=${passes.length}`);
console.log(`CHECKS_FAILED=${failures.length}`);
for (const failure of failures) console.error(`FAIL ${failure}`);
if (failures.length) process.exit(1);
