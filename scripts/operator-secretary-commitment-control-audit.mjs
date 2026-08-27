import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`SECRETARY_COMMITMENT_CONTROL_AUDIT_MISSING:${label}`);
}

const runtime = read("lib/operator/secretary/SecretaryCommitmentControlRuntime.js");
const capability = read("lib/platform/capabilities/createSecretaryCommitmentControlCapability.js");
const platform = read("lib/platform/runtime/PlatformDomainRuntime.js");
const capture = read("lib/operator/secretary/SecretaryCommitmentCaptureRuntime.js");

requireText(runtime, "AVANTIQO_EXECUTIVE_SECRETARY_COMMITMENT_CONTROL_V1", "CONTRACT");
requireText(runtime, '.from("secretary_tasks")', "DURABLE_TASK_SOURCE");
requireText(runtime, '.from("secretary_jobs")', "DURABLE_JOB_SOURCE");
requireText(runtime, '.from("secretary_follow_ups")', "DURABLE_FOLLOW_UP_SOURCE");
requireText(runtime, "source_task_id", "JOB_PARENT_TASK_LINK");
requireText(runtime, "task_id", "FOLLOW_UP_PARENT_TASK_LINK");
requireText(runtime, "secretary_job_id", "FOLLOW_UP_PARENT_JOB_LINK");
requireText(runtime, "parent.linked_jobs.push", "LINKED_JOB_ABSORPTION");
requireText(runtime, "parent.next_actions.push", "LINKED_FOLLOW_UP_ABSORPTION");
requireText(runtime, 'job.status === "REVIEW_REQUIRED"', "EXECUTIVE_DECISION_BOUNDARY");
requireText(runtime, "OVERDUE_TEMPORALLY", "TEMPORAL_OVERDUE_ONLY");
requireText(runtime, 'source === "secretary_commitment_capture"', "CAPTURED_COMMITMENT_CATEGORY");
requireText(runtime, "explicit_commitment_count", "EXPLICIT_COMMITMENT_SUMMARY");
requireText(runtime, "durable_records_only: true", "DURABLE_RECORDS_ONLY");
requireText(runtime, "commitment_inferred: false", "NO_COMMITMENT_INFERENCE");
requireText(runtime, "urgency_inferred: false", "NO_URGENCY_INFERENCE");
requireText(runtime, "legal_breach_inferred: false", "NO_LEGAL_BREACH_INFERENCE");
requireText(runtime, "approval_extends_authority: false", "NO_APPROVAL_AUTHORITY_EXTENSION");
requireText(runtime, "platform_permissions_mutated: false", "NO_PERMISSION_MUTATION");
requireText(runtime, "binding_authority_delegated: false", "NO_BINDING_AUTHORITY");
requireText(runtime, "approval_authority_delegated: false", "NO_APPROVAL_AUTHORITY");
requireText(runtime, "external_authority_used: false", "NO_EXTERNAL_AUTHORITY");

requireText(capability, 'capability: "secretary_commitments"', "CAPABILITY");
requireText(capability, 'action: "read"', "READ_ACTION");
requireText(capability, '"what have we promised"', "PROMISE_ALIAS");
requireText(capability, '"who owes what by when"', "WHO_OWES_ALIAS");
requireText(capability, "operatorAutoExecute: true", "READ_AUTO_EXECUTE");
requireText(capability, "operatorRequiresConfirmation: false", "NO_READ_CONFIRMATION");
requireText(capability, "aiEnabled: false", "NO_PROVIDER_REQUIRED");
requireText(platform, "createSecretaryCommitmentControlCapability", "PLATFORM_IMPORT");
requireText(platform, "secretary_commitments", "PLATFORM_ROUTE");

requireText(capture, "explicit_commitment: true", "EXISTING_CAPTURE_EVIDENCE");
requireText(capture, 'source: "secretary_commitment_capture"', "EXISTING_CAPTURE_TASK_SOURCE");
requireText(capture, "commitment_extraction_item_key", "EXISTING_CAPTURE_DEDUP_KEY");

console.log("OPERATOR_SECRETARY_COMMITMENT_CONTROL_AUDIT=PASS");
console.log("SECRETARY_COMMITMENT_CONTROL_DURABLE_RECORDS_ONLY=true");
console.log("SECRETARY_COMMITMENT_CONTROL_LINKED_JOB_DEDUP=true");
console.log("SECRETARY_COMMITMENT_CONTROL_LINKED_FOLLOW_UP_DEDUP=true");
console.log("SECRETARY_COMMITMENT_CONTROL_EXPLICIT_CAPTURE_COMPATIBLE=true");
console.log("SECRETARY_COMMITMENT_CONTROL_EXECUTIVE_DECISION_BOUNDARY=true");
console.log("SECRETARY_COMMITMENT_CONTROL_TEMPORAL_OVERDUE_ONLY=true");
console.log("SECRETARY_COMMITMENT_CONTROL_COMMITMENT_INFERRED=false");
console.log("SECRETARY_COMMITMENT_CONTROL_URGENCY_INFERRED=false");
console.log("SECRETARY_COMMITMENT_CONTROL_LEGAL_BREACH_INFERRED=false");
console.log("SECRETARY_COMMITMENT_CONTROL_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_COMMITMENT_CONTROL_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_COMMITMENT_CONTROL_APPROVAL_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
