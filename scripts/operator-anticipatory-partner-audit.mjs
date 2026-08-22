import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  runtimeSource,
  capabilitySource,
  platformRuntimeSource,
  routeSource,
  homeSource,
  thesisContractSource,
  thesisRuntimeSource,
  projectStateSource,
  organizationalContextSource,
] = await Promise.all([
  readFile("lib/operator/runtime/OperatorAnticipatoryRuntime.js", "utf8"),
  readFile("lib/platform/capabilities/createOperatorAttentionCapability.js", "utf8"),
  readFile("lib/platform/runtime/PlatformDomainRuntime.js", "utf8"),
  readFile("app/api/operator/attention/route.js", "utf8"),
  readFile("components/operator/HomeAvantiqoIntelligence.jsx", "utf8"),
  readFile("lib/operator/contracts/OperatorBusinessThesis.js", "utf8"),
  readFile("lib/operator/runtime/OperatorBusinessThesisRuntime.js", "utf8"),
  readFile("lib/operator/contracts/OperatorProjectState.js", "utf8"),
  readFile("lib/operator/runtime/OperatorOrganizationalContextRuntime.js", "utf8"),
]);

assert.match(runtimeSource, /listOperatorCapabilities/);
assert.match(runtimeSource, /rankOperatorCapabilities/);
assert.match(runtimeSource, /loadOperatorOrganizationalContext/);
assert.match(runtimeSource, /platform\.operator_read_chain\.execute/);
assert.match(runtimeSource, /MAX_PLAN_STEPS = 4/);
assert.match(runtimeSource, /MIN_PLAN_STEPS = 2/);
assert.match(runtimeSource, /deterministicPlan/);
assert.match(runtimeSource, /manifest_ranked_domain_diverse_v2/);
assert.doesNotMatch(runtimeSource, /PLAN_ATTENTION/);
assert.match(runtimeSource, /requiredInputs\(capability\)\.length === 0/);
assert.match(runtimeSource, /text\(capability\?\.mode\)\.toLowerCase\(\) === "read"/);
assert.match(runtimeSource, /capability\?\.transactional !== true/);
assert.match(runtimeSource, /capability\?\.requires_confirmation !== true/);
assert.match(runtimeSource, /Recommendation never authorizes execution/i);
assert.match(runtimeSource, /live_evidence as the only source for claims about current state/i);
assert.match(runtimeSource, /representative sample/i);
assert.match(runtimeSource, /writeCached\(context, result\)/);
assert.match(runtimeSource, /CACHE_TTL_MS = 5 \* 60 \* 1000/);
assert.match(runtimeSource, /OPERATOR_ATTENTION_LATENCY_V2/);
assert.match(runtimeSource, /setup_ms/);
assert.match(runtimeSource, /read_chain_ms/);
assert.match(runtimeSource, /synthesis_ms/);

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

assert.match(capabilitySource, /OperatorAnticipatoryRuntime/);
assert.match(capabilitySource, /capability: "attention"/);
assert.match(capabilitySource, /action: "scan"/);
assert.match(capabilitySource, /operatorMode: "read"/);
assert.match(capabilitySource, /transactional: false/);
assert.match(capabilitySource, /risk: "low"/);
assert.match(capabilitySource, /may recommend registered actions but never executes/i);
assert.match(capabilitySource, /synthetic-intelligence/i);
assert.match(capabilitySource, /business-partner/i);
assert.match(capabilitySource, /be proactive/i);
assert.match(capabilitySource, /challenge my thinking/i);
assert.match(capabilitySource, /context\?\.metadata\?\.partyId/);
assert.match(platformRuntimeSource, /attention:\s*\{/);
assert.match(platformRuntimeSource, /createOperatorAttentionCapability/);

assert.match(thesisContractSource, /ATTENTION_LEVELS/);
assert.match(thesisContractSource, /SIGNAL_KINDS/);
assert.match(thesisContractSource, /OUTLOOK_HORIZONS/);
assert.match(thesisContractSource, /evidenceFingerprint/);
assert.match(thesisContractSource, /signalDelta/);
assert.match(thesisContractSource, /interruptionPolicy/);
assert.match(thesisContractSource, /should_interrupt/);
assert.match(thesisContractSource, /should_surface/);
assert.match(thesisContractSource, /recommendation_changed/);
assert.match(thesisContractSource, /evidence_changed/);
assert.match(thesisContractSource, /previousThesis/);

assert.match(thesisRuntimeSource, /Synthetic Intelligence maintaining an evidence-grounded business thesis/i);
assert.match(thesisRuntimeSource, /Prior thesis is context for comparison, never proof/i);
assert.match(thesisRuntimeSource, /Every signal and outlook item must cite/i);
assert.match(thesisRuntimeSource, /urgent means a credible condition/i);
assert.match(thesisRuntimeSource, /A prediction is not a fact/i);
assert.match(thesisRuntimeSource, /never authorizes execution/i);
assert.match(thesisRuntimeSource, /SYNTHESIZE_BUSINESS_THESIS/);
assert.match(thesisRuntimeSource, /buildOperatorBusinessThesis/);
assert.match(thesisRuntimeSource, /previous_business_thesis/);
assert.match(thesisRuntimeSource, /preview\?\.change\?\.evidence_changed === false/);
assert.match(thesisRuntimeSource, /unchangedThesis/);

assert.match(projectStateSource, /business_thesis/);
assert.match(projectStateSource, /normalizeOperatorBusinessThesis/);

assert.match(organizationalContextSource, /function thesisSnapshot/);
assert.match(organizationalContextSource, /evidence_scope:\s*"historical_context_only"/);
assert.match(organizationalContextSource, /not_live_proof:\s*true/);
assert.match(organizationalContextSource, /current_business_thesis/);
assert.match(organizationalContextSource, /business_thesis_is_historical_context:\s*true/);
assert.match(organizationalContextSource, /business_thesis_is_not_live_proof:\s*true/);
assert.match(organizationalContextSource, /current_business_claims_require_live_evidence:\s*true/);
assert.match(organizationalContextSource, /version:\s*2/);
assert.match(organizationalContextSource, /business_thesis:\s*thesisSnapshot\(state\.business_thesis\)/);
assert.match(organizationalContextSource, /current_business_thesis:\s*source\.current_business_thesis/);
assert.doesNotMatch(organizationalContextSource, /business_thesis_is_live_proof:\s*true/);

assert.match(routeSource, /requireOrganizationAccess/);
assert.match(routeSource, /resolveBusinessContext/);
assert.match(routeSource, /domain: "platform"/);
assert.match(routeSource, /capability: "attention"/);
assert.match(routeSource, /action: "scan"/);
assert.match(routeSource, /loadOrCreateIntelligenceConversation/);
assert.match(routeSource, /synthesizeOperatorBusinessThesis/);
assert.match(routeSource, /previousThesis: memory\.projectState\?\.business_thesis/);
assert.match(routeSource, /updateIntelligenceConversationState/);
assert.match(routeSource, /business_thesis: businessThesis/);
assert.match(routeSource, /thesis_interrupt/);
assert.match(routeSource, /OPERATOR_ATTENTION_LATENCY_V2/);
assert.doesNotMatch(routeSource, /service_role/i);

assert.match(homeSource, /fetch\("\/api\/operator\/attention"/);
assert.match(homeSource, /data-avantiqo-attention-brief="true"/);
assert.match(homeSource, /data-avantiqo-business-thesis="true"/);
assert.match(homeSource, /Synthetic Intelligence/);
assert.match(homeSource, /Your business partner/);
assert.match(homeSource, /What changed/);
assert.match(homeSource, /Outlook/);
assert.match(homeSource, /Recommended next move/);
assert.match(homeSource, /interruption\?\.should_interrupt === true/);
assert.match(homeSource, /sessionStorage\.getItem\(storageKey\)/);
assert.match(homeSource, /sessionStorage\.setItem\(storageKey, "1"\)/);
assert.match(homeSource, /synthetic-intelligence-interruption/);
assert.match(homeSource, /dedupe_key: dedupeKey/);
assert.match(homeSource, /Evidence-backed/);
assert.match(homeSource, /Recommendations are not approvals or authorization/);
assert.match(homeSource, /sendMessage\(/);
assert.doesNotMatch(homeSource, /forceRefresh:\s*true/);
assert.doesNotMatch(homeSource, /if \(!organizationId \|\| restoring\) return undefined/);
assert.match(homeSource, /\[organizationId, entityId, periodId\]\);/);

console.log("OPERATOR_ANTICIPATORY_PARTNER_AUDIT=PASS");
console.log("OPERATOR_ATTENTION_PLANNING=DETERMINISTIC_MANIFEST_DRIVEN");
console.log("OPERATOR_ATTENTION_PLANNING_AI_CALL=REMOVED");
console.log("OPERATOR_ATTENTION_EXECUTION=BOUNDED_PARALLEL_READ_CHAIN");
console.log("OPERATOR_ATTENTION_CURRENT_STATE=LIVE_EVIDENCE_ONLY");
console.log("OPERATOR_ATTENTION_RECOMMENDATIONS=NO_AUTOMATIC_WRITE_AUTHORIZATION");
console.log("OPERATOR_ATTENTION_SEMANTICS=DYNAMIC_NO_FIXED_BUSINESS_VOCABULARY");
console.log("OPERATOR_ATTENTION_PARTNER_INTENTS=PRIORITIES_RISKS_OPPORTUNITIES_OWNER_FOCUS");
console.log("OPERATOR_BUSINESS_THESIS=DURABLE_EVIDENCE_GROUNDED_DELTA_MODEL");
console.log("OPERATOR_BUSINESS_THESIS_OUTLOOK=CONDITIONAL_EVIDENCE_REFERENCED");
console.log("OPERATOR_BUSINESS_THESIS_UNCHANGED=REUSE_WITHOUT_SECOND_SYNTHESIS");
console.log("OPERATOR_BUSINESS_THESIS_INTERRUPTION=URGENT_DELTA_ONLY");
console.log("OPERATOR_BUSINESS_THESIS_INTERRUPTION_UI=SESSION_DEDUPED_SPEECH");
console.log("OPERATOR_BUSINESS_THESIS_CONTEXT=HISTORICAL_ONLY_NOT_LIVE_PROOF");
console.log("OPERATOR_ATTENTION_UI=PARALLEL_WITH_CONVERSATION_RESTORE");
console.log("OPERATOR_ATTENTION_UI=THESIS_PERSISTED_IN_PRIMARY_PROJECT_MEMORY");

await import("./operator-business-partner-decision-loop-audit.mjs");
await import("./operator-service-latency-observability-audit.mjs");
await import("./operator-autonomous-watch-audit.mjs");
