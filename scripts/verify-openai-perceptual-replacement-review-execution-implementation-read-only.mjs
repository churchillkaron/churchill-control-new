#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const PREVIEW_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPLACEMENT_REVIEW_EXECUTION_PREVIEW_V1";
const SOURCE_AUDIT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BOUNDED_POLL_RESULT_AUDIT_V1";
const EXECUTION_SCRIPT =
  "scripts/execute-openai-perceptual-replacement-reviews-approved.mjs";
const OUTPUT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPLACEMENT_REVIEW_IMPLEMENTATION_VERIFY_V1";

const text = (value) => String(value ?? "").trim();
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value.filter(Boolean) : [];

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function readJson(filePath, label) {
  const absolute = path.resolve(text(filePath));
  if (!absolute || !fs.existsSync(absolute)) {
    throw new Error(`${label}_NOT_FOUND:${absolute || "MISSING"}`);
  }
  return {
    absolute,
    value: JSON.parse(fs.readFileSync(absolute, "utf8")),
  };
}

function writeJson(filePath, value) {
  const absolute = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const previewFile = readJson(
  process.argv[2],
  "REPLACEMENT_REVIEW_EXECUTION_PREVIEW",
);
const sourceAuditFile = readJson(
  process.argv[3],
  "COMPLETED_SOURCE_RESULT_AUDIT",
);
const preview = object(previewFile.value);
const sourceAudit = object(sourceAuditFile.value);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_REPLACEMENT_REVIEW_IMPLEMENTATION_VERIFY_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-replacement-review-implementation-verification.json",
);
const checkpointPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_REPLACEMENT_REVIEW_CHECKPOINT) ||
    "/tmp/churchill-openai-perceptual-replacement-review-execution-checkpoint.json",
);

const scriptPath = path.resolve(EXECUTION_SCRIPT);
if (!fs.existsSync(scriptPath)) {
  throw new Error(`REVIEW_EXECUTION_SCRIPT_NOT_FOUND:${scriptPath}`);
}
const source = fs.readFileSync(scriptPath, "utf8");
const scriptSha = sha256(source);
const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(
  text(preview.contract) === PREVIEW_CONTRACT,
  "PREVIEW_CONTRACT_INVALID",
);
requireValue(
  text(sourceAudit.contract) === SOURCE_AUDIT_CONTRACT,
  "SOURCE_AUDIT_CONTRACT_INVALID",
);
requireValue(
  text(preview.decision) ===
    "REPLACEMENT_PERCEPTUAL_REVIEW_9_TASK_EXECUTION_PREVIEW_CONFIRMED" &&
    text(preview.readiness) ===
      "READY_FOR_GUARDED_REPLACEMENT_PERCEPTUAL_REVIEW_IMPLEMENTATION" &&
    Number(preview.review_task_count) === 9 &&
    Number(preview.ready_count) === 9 &&
    Number(preview.failure_count) === 0 &&
    Number(preview.frame_ready_count) === 9 &&
    Number(preview.credential_ready_count) === 9 &&
    Number(preview.maximum_authorized_spend) === 3.9312 &&
    list(preview.blockers).length === 0 &&
    preview.state_unchanged === true,
  "PREVIEW_NOT_CLEAN",
);
requireValue(
  text(sourceAudit.decision) ===
    "REPAIR_SOURCE_9_COMPLETED_VIDEO_ASSETS_CONFIRMED" &&
    Number(sourceAudit.source_ready_count) === 9 &&
    Number(sourceAudit.source_failure_count) === 0 &&
    list(sourceAudit.blockers).length === 0,
  "SOURCE_AUDIT_NOT_CLEAN",
);

const requiredFragments = [
  'const AUTHORIZATION_ENV = "REPLACEMENT_PERCEPTUAL_REVIEW_AUTHORIZATION"',
  'const MAXIMUM_OPENAI_CALLS = 9',
  'const MAXIMUM_CALLS_PER_REVIEW = 1',
  '"REVIEW_CALL_STARTED"',
  '"REVIEW_PASSED"',
  '"REVIEW_REJECTED"',
  '"REVIEW_TECHNICAL_FAILED"',
  '"REVIEW_CALL_EXCEPTION"',
  'authorization === text(preview.expected_authorization)',
  'Number(preview.execution_contract?.maximum_provider_calls) === 9',
  'Number(preview.execution_contract?.maximum_calls_per_task) === 1',
  'Number(preview.execution_contract?.source_regeneration_permitted) === 0',
  'Number(preview.execution_contract?.runway_polling_permitted) === 0',
  'Number(preview.execution_contract?.retries_permitted) === 0',
  'Number(preview.execution_contract?.finalisation_permitted) === 0',
  'Number(preview.execution_contract?.publication_permitted) === 0',
  'await ProductionTaskRuntime.dispatch(record.review_task_id)',
  'record.provider_call_count = 1',
  'checkpoint.provider_call_count =',
  'review.cost?.approved === true',
  'replacement_review_execution_authorized: true',
  'sourceAssetId(sourceAfter) === text(record.asset_node_id)',
  'actualSpend > money(preview.maximum_authorized_spend)',
  'after.wallet_reserved_balance !== 0',
  'providerCallCount !== 9',
  'RETRIES_EXECUTED=NO',
  'SOURCE_REGENERATION_EXECUTED=NO',
  'RUNWAY_POLLS_EXECUTED=NO',
  'FINALISATION_EXECUTED=NO',
  'PUBLICATION_EXECUTED=NO',
];
const forbiddenFragments = [
  "ProductionTaskRuntime.poll(",
  "RunwayProvider",
  "retry(",
  "FINALISE_PRODUCTION",
  "PUBLISH_PRODUCTION",
  "delete(",
];

for (const fragment of requiredFragments) {
  requireValue(
    source.includes(fragment),
    `REQUIRED_FRAGMENT_MISSING:${fragment}`,
  );
}
for (const fragment of forbiddenFragments) {
  requireValue(
    !source.includes(fragment),
    `FORBIDDEN_FRAGMENT_PRESENT:${fragment}`,
  );
}

requireValue(
  text(preview.expected_authorization) ===
    "AUTHORIZE REPLACEMENT PERCEPTUAL REVIEWS OPENAI 9 TASKS MAX 3.931200 THB 25a1e7d969bfa14d246836060bcbddd6df88a4e29dc6749e831b6cc58a871ccf",
  "EXPECTED_AUTHORIZATION_CHANGED",
);
requireValue(
  text(preview.execution_contract_sha256) ===
    "25a1e7d969bfa14d246836060bcbddd6df88a4e29dc6749e831b6cc58a871ccf",
  "EXECUTION_CONTRACT_HASH_CHANGED",
);
requireValue(
  fs.existsSync(checkpointPath) === false,
  "REVIEW_EXECUTION_CHECKPOINT_ALREADY_EXISTS",
);

const decision = blockers.length
  ? "REPLACEMENT_PERCEPTUAL_REVIEW_IMPLEMENTATION_VERIFY_BLOCKED"
  : "REPLACEMENT_PERCEPTUAL_REVIEW_IMPLEMENTATION_CONFIRMED";
const readiness = blockers.length
  ? "REPLACEMENT_PERCEPTUAL_REVIEW_IMPLEMENTATION_VERIFY_BLOCKED"
  : "READY_FOR_EXPLICIT_REPLACEMENT_PERCEPTUAL_REVIEW_AUTHORIZATION";

const report = {
  contract: OUTPUT_CONTRACT,
  generated_at: new Date().toISOString(),
  execution_script: EXECUTION_SCRIPT,
  execution_script_sha256: scriptSha,
  required_fragment_count: requiredFragments.length,
  forbidden_fragment_count: forbiddenFragments.length,
  checkpoint_path: checkpointPath,
  checkpoint_existed_before: fs.existsSync(checkpointPath),
  expected_authorization: preview.expected_authorization,
  maximum_authorized_spend: preview.maximum_authorized_spend,
  review_task_count: preview.review_task_count,
  blockers,
  decision,
  readiness,
  database_writes_executed: false,
  provider_calls_executed: false,
  wallet_mutations_executed: false,
  source_regeneration_executed: false,
  runway_polls_executed: false,
  review_execution_executed: false,
  finalisation_executed: false,
  publication_executed: false,
};
writeJson(outputPath, report);

console.log("============================================================");
console.log("READ-ONLY REPLACEMENT PERCEPTUAL REVIEW IMPLEMENTATION VERIFY");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`EXECUTION_SCRIPT=${EXECUTION_SCRIPT}`);
console.log(`EXECUTION_SCRIPT_SHA256=${scriptSha}`);
console.log(`REQUIRED_FRAGMENT_COUNT=${requiredFragments.length}`);
console.log(`FORBIDDEN_FRAGMENT_COUNT=${forbiddenFragments.length}`);
console.log(`CHECKPOINT_EXISTED_BEFORE=${fs.existsSync(checkpointPath) ? "YES" : "NO"}`);
console.log(`EXPECTED_REVIEW_AUTHORIZATION=${preview.expected_authorization}`);
console.log(`MAXIMUM_AUTHORIZED_SPEND=${preview.maximum_authorized_spend}`);
console.log(`IMPLEMENTATION_VERIFY_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`IMPLEMENTATION_VERIFY_DECISION=${decision}`);
console.log(`AUDIT_READINESS=${readiness}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_MUTATIONS_EXECUTED=NO");
console.log("SOURCE_REGENERATION_EXECUTED=NO");
console.log("RUNWAY_POLLS_EXECUTED=NO");
console.log("REVIEW_EXECUTION_EXECUTED=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length) process.exitCode = 2;
