import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const APPLY = process.argv.includes("--apply");
const CONTRACT = "AVANTIQO_INTERNAL_PRODUCT_LEARNING_LOCAL_CERTIFICATION_V1";

function text(value, limit = 2000) {
  return String(value ?? "").trim().slice(0, limit);
}

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout, 700)}`);
  }
  return text(result.stdout, 5000);
}

function assertCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_INTERNAL_LEARNING_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_INTERNAL_LEARNING_GIT_BRANCH_FAILED");
  if (branch !== "main") {
    throw new Error(`AVANTIQO_INTERNAL_LEARNING_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  }
  const local = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_INTERNAL_LEARNING_GIT_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_INTERNAL_LEARNING_GIT_REMOTE_FAILED");
  if (local !== remote) {
    throw new Error(`AVANTIQO_INTERNAL_LEARNING_LOCAL_MAIN_NOT_CURRENT:head=${local}:origin_main=${remote}`);
  }
  return local;
}

const mainCommit = assertCurrentMain();
const {
  buildAvantiqoInternalProductKnowledgeUnits,
  syncAvantiqoInternalProductKnowledge,
} = await import(
  "@/lib/intelligence/runtime/AvantiqoInternalProductKnowledgeRuntime"
);

const units = buildAvantiqoInternalProductKnowledgeUnits();
const byType = {};
const byDomain = {};
for (const unit of units) {
  byType[unit.object_type] = (byType[unit.object_type] || 0) + 1;
  const domain = unit.domain || "unscoped";
  byDomain[domain] = (byDomain[domain] || 0) + 1;
}

console.log("============================================================");
console.log("AVANTIQO INTERNAL PRODUCT LEARNING - LOCAL CERTIFICATION");
console.log("============================================================");
console.log(`CONTRACT=${CONTRACT}`);
console.log(`MODE=${APPLY ? "APPLY" : "PLAN"}`);
console.log(`MAIN_COMMIT=${mainCommit}`);
console.log(`CANONICAL_KNOWLEDGE_UNIT_COUNT=${units.length}`);
console.log(`CANONICAL_KNOWLEDGE_BY_TYPE=${JSON.stringify(byType)}`);
console.log(`CANONICAL_KNOWLEDGE_BY_DOMAIN=${JSON.stringify(byDomain)}`);
console.log("PROVIDER_EXECUTION_PERFORMED=NO");
console.log("WEB_RESEARCH_PERFORMED=NO");
console.log("MODEL_INFERENCE_PERFORMED=NO");
console.log("MODEL_TRAINING_PERFORMED=NO");
console.log("MODEL_WEIGHT_MUTATION_PERFORMED=NO");
console.log("PRODUCTION_DEPLOY_PERFORMED=NO");
console.log("CUSTOMER_PRIVATE_CONTENT_USED=NO");
console.log("RAW_REASONING_USED=NO");
console.log("SECRETS_PRINTED=NO");

if (!APPLY) {
  console.log("AVANTIQO_INTERNAL_PRODUCT_LEARNING_LOCAL_CERTIFICATION=PLAN_READY");
  console.log("NEXT_ACTION=RUN_WITH_--apply_AND_AVANTIQO_INTERNAL_PRODUCT_LEARNING_SYNC_APPROVED=YES");
  process.exit(0);
}

if (text(process.env.AVANTIQO_INTERNAL_PRODUCT_LEARNING_SYNC_APPROVED, 20).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_INTERNAL_PRODUCT_LEARNING_SYNC_APPROVED=YES_REQUIRED");
}

const result = await syncAvantiqoInternalProductKnowledge();
if (result.available !== true || result.status !== "SYNCED") {
  throw new Error(`AVANTIQO_INTERNAL_PRODUCT_LEARNING_SYNC_FAILED:${result.reason || result.status || "UNKNOWN"}`);
}
if (Number(result.unit_count || 0) !== units.length) {
  throw new Error(`AVANTIQO_INTERNAL_PRODUCT_LEARNING_UNIT_COUNT_MISMATCH:built=${units.length}:synced=${result.unit_count}`);
}

console.log(`SYNC_STATUS=${result.status}`);
console.log(`SYNC_UNIT_COUNT=${result.unit_count}`);
console.log(`SYNC_WRITTEN_COUNT=${result.written_count}`);
console.log(`SYNC_UNCHANGED_COUNT=${result.unchanged_count}`);
console.log(`SYNC_RETIRED_COUNT=${result.retired_count}`);
console.log(`SYNC_GOVERNANCE=${JSON.stringify(result.governance || {})}`);
console.log("AVANTIQO_INTERNAL_PRODUCT_LEARNING_LOCAL_CERTIFICATION=PASS");
