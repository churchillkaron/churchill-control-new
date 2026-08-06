#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const PREVIEW_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BOUNDED_POLL_PREVIEW_V2";
const DISPATCH_CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_CHECKPOINT_V1";
const VERIFY_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BOUNDED_POLL_IMPLEMENTATION_VERIFY_V1";
const POLL_SCRIPT =
  "scripts/poll-openai-perceptual-repair-sources-bounded-approved.mjs";

const text = (value) => String(value ?? "").trim();
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const money = (value) => Number(Number(value || 0).toFixed(6));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(stable(value)))
    .digest("hex");
}

function readJson(filePath, label) {
  const absolute = path.resolve(text(filePath));
  if (!absolute || !fs.existsSync(absolute)) {
    throw new Error(`${label}_NOT_FOUND:${absolute || "MISSING"}`);
  }
  const raw = fs.readFileSync(absolute, "utf8");
  return {
    absolute,
    raw,
    file_sha256: sha256(raw),
    value: JSON.parse(raw),
  };
}

function writeJson(filePath, value) {
  const absolute = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const previewFile = readJson(process.argv[2], "BOUNDED_POLL_PREVIEW_V2");
const checkpointFile = readJson(process.argv[3], "SOURCE_DISPATCH_CHECKPOINT");
const preview = object(previewFile.value);
const checkpoint = object(checkpointFile.value);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_SOURCE_BOUNDED_POLL_IMPLEMENTATION_VERIFY_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-repair-source-bounded-poll-implementation-verification.json",
);
const scriptPath = path.resolve(process.cwd(), POLL_SCRIPT);
if (!fs.existsSync(scriptPath)) {
  throw new Error(`BOUNDED_POLL_SCRIPT_NOT_FOUND:${scriptPath}`);
}
const script = fs.readFileSync(scriptPath, "utf8");

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(
  text(preview.contract) === PREVIEW_CONTRACT,
  "PREVIEW_CONTRACT_INVALID",
);
requireValue(
  text(checkpoint.contract) === DISPATCH_CHECKPOINT_CONTRACT,
  "DISPATCH_CHECKPOINT_CONTRACT_INVALID",
);
requireValue(
  text(preview.decision) ===
    "REPAIR_SOURCE_BOUNDED_POLL_9_JOB_ROUND_1_V2_PREVIEW_CONFIRMED" &&
    text(preview.readiness) ===
      "READY_FOR_GUARDED_BOUNDED_PROVIDER_STATUS_POLL_IMPLEMENTATION" &&
    Number(preview.ready_count) === 9 &&
    Number(preview.failure_count) === 0 &&
    Number(preview.credential_ready_count) === 9 &&
    Number(preview.maximum_provider_status_calls) === 9 &&
    Number(preview.maximum_calls_per_job) === 1 &&
    money(preview.reservation_total) === 47.34288 &&
    list(preview.blockers).length === 0 &&
    preview.state_unchanged === true,
  "PREVIEW_NOT_READY",
);
requireValue(
  text(checkpoint.status) === "SUBMITTED" &&
    list(checkpoint.source_records).length === 9 &&
    money(checkpoint.maximum_authorized_spend) === 47.34288,
  "DISPATCH_CHECKPOINT_INVALID",
);
requireValue(
  sha256(object(preview.poll_contract)) === text(preview.poll_contract_sha256),
  "POLL_CONTRACT_HASH_INVALID",
);
requireValue(
  text(preview.expected_authorization) ===
    `AUTHORIZE BOUNDED REPAIR SOURCE STATUS POLL RUNWAY 9 JOBS ROUND 1 NO RETRIES NO REVIEWS ${preview.poll_contract_sha256}`,
  "EXPECTED_AUTHORIZATION_INVALID",
);

const requiredFragments = [
  'const AUTHORIZATION_ENV =',
  '"PAIR_REPAIR_SOURCE_BOUNDED_POLL_AUTHORIZATION"',
  'authorization === text(preview.expected_authorization)',
  'maximum_provider_status_calls',
  'maximum_calls_per_job',
  'retries_permitted',
  'review_execution_permitted',
  'generic_production_task_poll_permitted',
  'direct_service_settlement_required',
  'ServiceExecutionRuntime.settle({',
  'record.state = "POLL_STARTED"',
  'record.provider_status_call_count = 1',
  'writeJson(pollCheckpointPath, pollCheckpoint)',
  '"POLL_TRANSPORT_ERROR"',
  '"POLL_PARTIAL_WRITE_ERROR"',
  'database_state_unchanged',
  'ProductionTaskRuntime.complete(',
  'ProductionTaskRuntime.fail(',
  'DOWNSTREAM_REVIEW_STATE_CHANGED',
  'PROVIDER_STATUS_CALL_LIMIT_EXCEEDED',
  'PER_JOB_STATUS_CALL_LIMIT_EXCEEDED',
  'SETTLEMENT_TOTAL_EXCEEDS_AUTHORIZED_RESERVATION',
  'PROVIDER_GENERATION_CALLS_EXECUTED=NO',
  'RETRIES_EXECUTED=NO',
  'REVIEW_EXECUTION_EXECUTED=NO',
  'FINALISATION_EXECUTED=NO',
  'PUBLICATION_EXECUTED=NO',
];
for (const fragment of requiredFragments) {
  requireValue(script.includes(fragment), `SCRIPT_FRAGMENT_MISSING:${fragment}`);
}

const forbiddenFragments = [
  'ProductionTaskRuntime.poll(',
  'ProductionTaskRuntime.dispatch(',
  'executeProvider({',
  'runAIService.execute(',
  'retry(',
];
for (const fragment of forbiddenFragments) {
  requireValue(!script.includes(fragment), `FORBIDDEN_SCRIPT_FRAGMENT:${fragment}`);
}

const checkpointBefore = fs.existsSync(
  "/tmp/churchill-openai-perceptual-repair-source-bounded-poll-checkpoint-round-1.json",
);
const decision = blockers.length
  ? "REPAIR_SOURCE_BOUNDED_POLL_IMPLEMENTATION_VERIFY_BLOCKED"
  : "REPAIR_SOURCE_BOUNDED_POLL_IMPLEMENTATION_CONFIRMED";
const readiness = blockers.length
  ? "REPAIR_SOURCE_BOUNDED_POLL_IMPLEMENTATION_VERIFY_BLOCKED"
  : "READY_FOR_EXPLICIT_ROUND_1_POLL_AUTHORIZATION";

const report = {
  contract: VERIFY_CONTRACT,
  generated_at: new Date().toISOString(),
  preview_file: previewFile.absolute,
  preview_file_sha256: previewFile.file_sha256,
  dispatch_checkpoint_file: checkpointFile.absolute,
  dispatch_checkpoint_file_sha256: checkpointFile.file_sha256,
  poll_script: POLL_SCRIPT,
  poll_script_sha256: sha256(script),
  expected_authorization: preview.expected_authorization,
  required_fragment_count: requiredFragments.length,
  forbidden_fragment_count: forbiddenFragments.length,
  blockers,
  decision,
  readiness,
  poll_checkpoint_existed_before_verification: checkpointBefore,
  database_writes_executed: false,
  provider_status_calls_executed: false,
  provider_generation_calls_executed: false,
  wallet_mutations_executed: false,
  review_execution_executed: false,
  finalisation_executed: false,
  publication_executed: false,
};
writeJson(outputPath, report);

console.log("============================================================");
console.log("READ-ONLY GUARDED BOUNDED POLL IMPLEMENTATION VERIFY");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`POLL_SCRIPT=${POLL_SCRIPT}`);
console.log(`POLL_SCRIPT_SHA256=${report.poll_script_sha256}`);
console.log(`REQUIRED_FRAGMENT_COUNT=${requiredFragments.length}`);
console.log(`FORBIDDEN_FRAGMENT_COUNT=${forbiddenFragments.length}`);
console.log(`POLL_CHECKPOINT_EXISTED_BEFORE=${checkpointBefore ? "YES" : "NO"}`);
console.log(`EXPECTED_POLL_AUTHORIZATION=${preview.expected_authorization}`);
console.log(`IMPLEMENTATION_VERIFY_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`IMPLEMENTATION_VERIFY_DECISION=${decision}`);
console.log(`AUDIT_READINESS=${readiness}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_STATUS_CALLS_EXECUTED=NO");
console.log("PROVIDER_GENERATION_CALLS_EXECUTED=NO");
console.log("WALLET_MUTATIONS_EXECUTED=NO");
console.log("REVIEW_EXECUTION_EXECUTED=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length) process.exitCode = 2;
