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
const fastExecutionMarker = "\n    try {";
const deepExecutionMarker = 'service_id: "ai.reasoning.execute"';

check("verified learning runtime is imported", source.includes(importMarker));
check("deep reasoning loads verified learning", source.includes(loadMarker));
check("deep request exposes bounded verified learning", source.includes("verified_platform_learning:"));
check("prompt marks learned context advisory only", source.includes("verified_platform_learning is platform-level reusable learned experience"));
check("prompt says learned context is retrieval-only", source.includes("retrieval-only advisory planning context"));
check("prompt says learned context is not current business state", source.includes("not proof of current business state"));
check("prompt says learned context never authorizes action", source.includes("never authorization for an action"));
check("metadata records learning usage", source.includes("verified_platform_learning_used:"));
check("metadata records learning count", source.includes("verified_platform_learning_count:"));
check("metadata records learning contract", source.includes("verified_platform_learning_contract:"));
check("metadata records retrieval-only mode", source.includes("verified_platform_learning_retrieval_only: true"));
check("metadata records zero fresh research", source.includes("verified_platform_learning_fresh_research_performed: false"));
check("metadata records customer-private separation", source.includes("platform_learning_customer_private_memory_reused: false"));

const fastStart = source.indexOf(fastRequestMarker);
const fastEnd = fastStart >= 0 ? source.indexOf(fastExecutionMarker, fastStart) : -1;
const loadStart = source.indexOf(loadMarker);
const requestStart = source.indexOf(requestMarker, loadStart);
const deepExecutionStart = source.indexOf(deepExecutionMarker, requestStart);
check("fast request is structurally bounded", fastStart >= 0 && fastEnd > fastStart);
check("learning load occurs after fast request construction", fastStart >= 0 && loadStart > fastStart);
check("learning load occurs after fast request block", fastEnd >= 0 && loadStart > fastEnd);
check("learning load occurs before deep request construction", loadStart >= 0 && requestStart > loadStart);
check("deep reasoning execution follows enriched request", deepExecutionStart > requestStart);

const fastRequestBlock = fastStart >= 0 && fastEnd > fastStart
  ? source.slice(fastStart, fastEnd)
  : "";
check("fast request remains free of platform-learning retrieval", !fastRequestBlock.includes("loadOperatorVerifiedLearningContext"));
check("fast request does not receive verified_platform_learning", !fastRequestBlock.includes("verified_platform_learning"));

check("bridge context is bounded before injection", source.includes("knowledge: verifiedLearningContext.knowledge"));
check("bridge carries retrieval-only evidence", source.includes("retrieval_only: verifiedLearningContext.retrieval_only"));
check("bridge carries zero-search evidence", source.includes("internet_search_performed: verifiedLearningContext.internet_search_performed"));
check("bridge carries zero-research evidence", source.includes("fresh_research_performed: verifiedLearningContext.fresh_research_performed"));
check("query and bridge errors are not injected into model request", !source.includes("query: verifiedLearningContext.query"));
check("learned context does not alter capability catalog", !source.includes("capabilities: verifiedLearningContext"));

console.log("AVANTIQO_OPERATOR_VERIFIED_LEARNING_REASONING_INTEGRATION_AUDIT");
console.log(`CHECKS_PASSED=${passes.length}`);
console.log(`CHECKS_FAILED=${failures.length}`);
for (const failure of failures) console.error(`FAIL ${failure}`);
if (failures.length) process.exit(1);
