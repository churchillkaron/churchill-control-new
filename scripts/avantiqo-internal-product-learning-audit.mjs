import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const assert = (condition, code) => {
  if (!condition) throw new Error(code);
};

const internalPath = "lib/intelligence/runtime/AvantiqoInternalProductKnowledgeRuntime.js";
const routerPath = "lib/intelligence/runtime/AvantiqoKnowledgeRouterRuntime.js";
const routePath = "app/api/internal/intelligence/continuous-learning/process/route.js";
const capabilityPath = "lib/platform/capabilities/createOperatorWebResearchCapability.js";
const indexPath = "lib/intelligence/index.js";
const vercelPath = "vercel.json";

const internal = read(internalPath);
const router = read(routerPath);
const route = read(routePath);
const capability = read(capabilityPath);
const index = read(indexPath);
const vercel = read(vercelPath);

assert(internal.includes("AVANTIQO_INTERNAL_PRODUCT_KNOWLEDGE_V1"), "INTERNAL_PRODUCT_LEARNING_CONTRACT_REQUIRED");
assert(internal.includes('ERP_REGISTRY } from "@/lib/platform/registry/erpRegistry.js"'), "INTERNAL_PRODUCT_CANONICAL_REGISTRY_REQUIRED");
assert(internal.includes("serializeCapability"), "INTERNAL_PRODUCT_CONVERGED_REGISTRY_SERIALIZATION_REQUIRED");
assert(internal.includes("AVANTIQO_PRODUCT_CONSTITUTION"), "INTERNAL_PRODUCT_CONSTITUTION_REQUIRED");
assert(internal.includes('const KNOWLEDGE_SCOPE = "platform_knowledge"'), "INTERNAL_PRODUCT_PLATFORM_KNOWLEDGE_SCOPE_REQUIRED");
assert(internal.includes('const INTERNAL_SOURCE = "avantiqo_canonical_product_knowledge"'), "INTERNAL_PRODUCT_SOURCE_REQUIRED");
assert(internal.includes('const INTERNAL_AUTHORITY = "AVANTIQO_CANONICAL_PRODUCT"'), "INTERNAL_PRODUCT_AUTHORITY_REQUIRED");
assert(internal.includes("internal_authoritative: true"), "INTERNAL_PRODUCT_AUTHORITY_METADATA_REQUIRED");
assert(internal.includes("customer_private_content_included: false"), "INTERNAL_PRODUCT_CUSTOMER_PRIVATE_CONTENT_FORBIDDEN");
assert(internal.includes("raw_customer_turn_included: false"), "INTERNAL_PRODUCT_RAW_CUSTOMER_TURNS_FORBIDDEN");
assert(internal.includes("raw_payload_included: false"), "INTERNAL_PRODUCT_RAW_PAYLOAD_FORBIDDEN");
assert(internal.includes("raw_output_included: false"), "INTERNAL_PRODUCT_RAW_OUTPUT_FORBIDDEN");
assert(internal.includes("raw_reasoning_persisted: false"), "INTERNAL_PRODUCT_RAW_REASONING_FORBIDDEN");
assert(internal.includes('authorization_value: "none"'), "INTERNAL_PRODUCT_NO_AUTHORIZATION_VALUE_REQUIRED");
assert(internal.includes("provider_execution_used: false"), "INTERNAL_PRODUCT_PROVIDER_FREE_REQUIRED");
assert(internal.includes("model_weight_mutation: false"), "INTERNAL_PRODUCT_NO_WEIGHT_MUTATION_REQUIRED");
assert(internal.includes("superseded_at: nowIso"), "INTERNAL_PRODUCT_STALE_RETIREMENT_REQUIRED");
assert(internal.includes("content_fingerprint"), "INTERNAL_PRODUCT_CHANGE_FINGERPRINT_REQUIRED");
assert(internal.includes("FORBIDDEN_KEY"), "INTERNAL_PRODUCT_SECRET_FIELD_FILTER_REQUIRED");

assert(router.includes("AVANTIQO_KNOWLEDGE_ROUTER_V1"), "KNOWLEDGE_ROUTER_CONTRACT_REQUIRED");
assert(router.includes("productStateQuery"), "KNOWLEDGE_ROUTER_PRODUCT_STATE_CLASSIFIER_REQUIRED");
assert(router.includes("CANONICAL_PRODUCT_KNOWLEDGE_REUSED"), "KNOWLEDGE_ROUTER_CANONICAL_REUSE_REQUIRED");
assert(router.includes("appropriate_only_for_avantiqo_product_state: true"), "KNOWLEDGE_ROUTER_AUTHORITY_BOUNDARY_REQUIRED");
assert(router.includes("external_general_knowledge_authority: false"), "KNOWLEDGE_ROUTER_GENERAL_AUTHORITY_FORBIDDEN");
assert(router.includes("mutable_customer_business_state_proven: false"), "KNOWLEDGE_ROUTER_MUTABLE_CUSTOMER_STATE_FORBIDDEN");
assert(router.includes("runKnowledgeAwareWebResearch"), "KNOWLEDGE_ROUTER_WEB_FALLBACK_REQUIRED");
assert(router.includes("payload.force_refresh !== true"), "KNOWLEDGE_ROUTER_FORCE_REFRESH_REQUIRED");

assert(route.includes("syncAvantiqoInternalProductKnowledge"), "CONTINUOUS_LEARNING_INTERNAL_SYNC_REQUIRED");
const internalSyncCall = route.indexOf("const internalProductKnowledge = await syncAvantiqoInternalProductKnowledge()");
const webLearningCall = route.indexOf("const result = await runAvantiqoContinuousLearningBatch({ limit })");
assert(internalSyncCall >= 0, "CONTINUOUS_LEARNING_INTERNAL_SYNC_CALL_REQUIRED");
assert(webLearningCall >= 0, "CONTINUOUS_LEARNING_WEB_BATCH_CALL_REQUIRED");
assert(internalSyncCall < webLearningCall, "CONTINUOUS_LEARNING_INTERNAL_SYNC_BEFORE_WEB_LEARNING_REQUIRED");
assert(route.includes("internal_product_knowledge"), "CONTINUOUS_LEARNING_INTERNAL_SYNC_EVIDENCE_REQUIRED");
assert(capability.includes("runAvantiqoKnowledgeAwareResearch"), "OPERATOR_RESEARCH_KNOWLEDGE_ROUTER_REQUIRED");
assert(capability.includes("canonical-product-knowledge"), "OPERATOR_RESEARCH_CANONICAL_TAG_REQUIRED");
assert(index.includes("AvantiqoInternalProductKnowledgeRuntime"), "INTERNAL_PRODUCT_RUNTIME_EXPORT_REQUIRED");
assert(index.includes("AvantiqoKnowledgeRouterRuntime"), "KNOWLEDGE_ROUTER_RUNTIME_EXPORT_REQUIRED");
assert(vercel.includes('"path": "/api/internal/intelligence/continuous-learning/process"'), "CONTINUOUS_LEARNING_CRON_REQUIRED");
assert(vercel.includes('"schedule": "17 * * * *"'), "CONTINUOUS_LEARNING_HOURLY_CRON_REQUIRED");

console.log("AVANTIQO_INTERNAL_PRODUCT_LEARNING_AUDIT=PASS");
console.log("AVANTIQO_INTERNAL_PRODUCT_CANONICAL_REGISTRY_LEARNING=YES");
console.log("AVANTIQO_INTERNAL_PRODUCT_CONSTITUTION_LEARNING=YES");
console.log("AVANTIQO_INTERNAL_PRODUCT_STALE_RETIREMENT=YES");
console.log("AVANTIQO_INTERNAL_PRODUCT_CUSTOMER_PRIVATE_CONTENT=NO");
console.log("AVANTIQO_INTERNAL_PRODUCT_RAW_REASONING=NO");
console.log("AVANTIQO_INTERNAL_PRODUCT_AUTHORIZATION_EFFECT=NONE");
console.log("AVANTIQO_INTERNAL_PRODUCT_PROVIDER_EXECUTION=NO");
console.log("AVANTIQO_INTERNAL_PRODUCT_MODEL_WEIGHT_MUTATION=NO");
console.log("AVANTIQO_KNOWLEDGE_ROUTER_CANONICAL_PRODUCT_AUTHORITY=YES");
console.log("AVANTIQO_KNOWLEDGE_ROUTER_GENERAL_WEB_EVIDENCE_FALLBACK=YES");
console.log("AVANTIQO_CONTINUOUS_LEARNING_INTERNAL_SYNC=HOURLY");