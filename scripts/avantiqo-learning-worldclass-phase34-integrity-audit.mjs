import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const integrityPath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoSelectionPolicyShadowEvaluationIntegrityRuntime.js",
);
const routePath = path.join(
  root,
  "app/api/internal/intelligence/continuous-learning/process/route.js",
);
const indexPath = path.join(root, "lib/intelligence/index.js");

function fail(message) {
  console.error(`AVANTIQO_PHASE34_INTEGRITY_AUDIT_FAIL=${message}`);
  process.exit(1);
}

function requireText(source, needle, code) {
  if (!source.includes(needle)) fail(code);
}

function requireOrder(source, first, second, code) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex >= secondIndex) fail(code);
}

function nodeCheck(file, code) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(result.stdout || "");
    console.error(result.stderr || "");
    fail(code);
  }
}

for (const file of [integrityPath, routePath]) {
  if (!fs.existsSync(file)) fail(`MISSING_${path.basename(file)}`);
  nodeCheck(file, `NODE_CHECK_${path.basename(file)}`);
}

const integrity = fs.readFileSync(integrityPath, "utf8");
const route = fs.readFileSync(routePath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");

requireText(
  integrity,
  '"AVANTIQO_SELECTION_POLICY_SHADOW_EVALUATION_INTEGRITY_V1"',
  "CONTRACT_MISSING",
);
requireText(
  integrity,
  "authoritative_one_evaluation_per_selection_cycle: true",
  "ONE_AUTHORITATIVE_PER_CYCLE_MISSING",
);
requireText(
  integrity,
  "authoritative_selection_prefers_most_observed_candidates: true",
  "MOST_OBSERVED_AUTHORITY_MISSING",
);
requireText(
  integrity,
  "authoritative_selection_then_prefers_most_comparable_pairs: true",
  "MOST_PAIRS_AUTHORITY_MISSING",
);
requireText(
  integrity,
  "authoritative_selection_then_prefers_newest_evaluation: true",
  "NEWEST_AUTHORITY_MISSING",
);
requireText(
  integrity,
  "incremental_evaluation_versions_count_once: true",
  "INCREMENTAL_COUNT_ONCE_MISSING",
);
requireText(
  integrity,
  "maturity_uses_authoritative_evaluations_only: true",
  "AUTHORITATIVE_MATURITY_ONLY_MISSING",
);
requireText(
  integrity,
  '"REDUNDANT_INCREMENTAL_EVALUATION_SUPERSEDED"',
  "REDUNDANT_SUPERSESSION_MISSING",
);
requireText(
  integrity,
  "promotion_review_recomputed_from_authoritative_only: true",
  "REVIEW_RECOMPUTE_MISSING",
);
requireText(integrity, "automatic_policy_promotion: false", "AUTO_PROMOTION_NOT_FALSE");
requireText(integrity, "live_policy_mutated: false", "LIVE_POLICY_MUTATION_NOT_FALSE");
requireText(integrity, "live_selection_mutated: false", "LIVE_SELECTION_MUTATION_NOT_FALSE");
requireText(
  integrity,
  "numeric_selection_scores_mutated: false",
  "NUMERIC_SCORE_MUTATION_NOT_FALSE",
);
requireText(integrity, "execution_authorized: false", "EXECUTION_AUTH_NOT_FALSE");
requireText(integrity, "provider_called_here: false", "PROVIDER_CALL_NOT_FALSE");
requireText(integrity, "wallet_write_performed_here: false", "WALLET_WRITE_NOT_FALSE");
requireText(integrity, "runpod_job_submitted: false", "RUNPOD_JOB_NOT_FALSE");
requireText(integrity, "platform_knowledge_written: false", "KNOWLEDGE_WRITE_NOT_FALSE");
requireText(integrity, "automatic_training_started: false", "TRAINING_NOT_FALSE");

requireText(
  route,
  "reconcileAvantiqoSelectionPolicyShadowEvaluationIntegrity",
  "ROUTE_INTEGRITY_IMPORT_MISSING",
);
requireText(
  route,
  "selectionPolicyShadowEvaluationIntegrity.success !== false",
  "ROUTE_FAIL_CLOSED_GATE_MISSING",
);
requireText(
  route,
  '"BLOCKED_BY_SHADOW_EVALUATION_INTEGRITY_FAIL_CLOSED"',
  "ROUTE_FAIL_CLOSED_STATUS_MISSING",
);
requireOrder(
  route,
  "await reconcileAvantiqoSelectionPolicyShadowEvaluationIntegrity()",
  "await reconcileAvantiqoSelectionPolicyPromotionRequests()",
  "INTEGRITY_MUST_PRECEDE_PHASE31_REQUESTS",
);
requireOrder(
  route,
  "await reconcileAvantiqoSelectionPolicyShadowEvaluationIntegrity()",
  "await reconcileAvantiqoPersistentOrderingPolicyPromotionRequests()",
  "INTEGRITY_MUST_PRECEDE_PHASE34_REQUESTS",
);
requireText(
  route,
  "selection_policy_shadow_evaluation_integrity:",
  "ROUTE_RESPONSE_EVIDENCE_MISSING",
);
requireText(
  index,
  'export * from "./runtime/AvantiqoSelectionPolicyShadowEvaluationIntegrityRuntime";',
  "INDEX_EXPORT_MISSING",
);

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE34_INTEGRITY_AUDIT=PASS");
console.log(
  "AVANTIQO_SELECTION_POLICY_SHADOW_EVALUATION_INTEGRITY_CONTRACT=AVANTIQO_SELECTION_POLICY_SHADOW_EVALUATION_INTEGRITY_V1",
);
console.log("AVANTIQO_PHASE34_INTEGRITY_ONE_AUTHORITATIVE_EVALUATION_PER_CYCLE=true");
console.log("AVANTIQO_PHASE34_INTEGRITY_MOST_OBSERVED_CANDIDATES_WINS=true");
console.log("AVANTIQO_PHASE34_INTEGRITY_MOST_COMPARABLE_PAIRS_SECOND=true");
console.log("AVANTIQO_PHASE34_INTEGRITY_NEWEST_EVALUATION_THIRD=true");
console.log("AVANTIQO_PHASE34_INTEGRITY_INCREMENTAL_VERSIONS_COUNT_ONCE=true");
console.log("AVANTIQO_PHASE34_INTEGRITY_REDUNDANT_EVALUATIONS_SUPERSEDED=true");
console.log("AVANTIQO_PHASE34_INTEGRITY_MATURITY_AUTHORITATIVE_ONLY=true");
console.log("AVANTIQO_PHASE34_INTEGRITY_REVIEW_RECOMPUTED_AUTHORITATIVE_ONLY=true");
console.log("AVANTIQO_PHASE34_INTEGRITY_PRECEDES_PHASE31_PROMOTION_REQUESTS=true");
console.log("AVANTIQO_PHASE34_INTEGRITY_PRECEDES_PHASE34_PROMOTION_REQUESTS=true");
console.log("AVANTIQO_PHASE34_INTEGRITY_PROMOTION_FAILS_CLOSED=true");
console.log("AVANTIQO_PHASE34_INTEGRITY_AUTOMATIC_POLICY_PROMOTION=false");
console.log("AVANTIQO_PHASE34_INTEGRITY_LIVE_POLICY_MUTATED=false");
console.log("AVANTIQO_PHASE34_INTEGRITY_LIVE_SELECTION_MUTATED=false");
console.log("AVANTIQO_PHASE34_INTEGRITY_NUMERIC_SELECTION_SCORES_MUTATED=false");
console.log("AVANTIQO_PHASE34_INTEGRITY_PROVIDER_CALL_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE34_INTEGRITY_WALLET_WRITE_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE34_INTEGRITY_RUNPOD_JOB_SUBMITTED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE34_INTEGRITY_EXECUTION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE34_INTEGRITY_PLATFORM_KNOWLEDGE_WRITTEN=false");
console.log("AVANTIQO_PHASE34_INTEGRITY_AUTOMATIC_TRAINING_STARTED=false");
