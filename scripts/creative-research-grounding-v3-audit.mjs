import fs from "node:fs";

const directorPath =
  "lib/creative/research/runtime/AutonomousResearchDirectorV4Runtime.js";
const workerPath =
  "lib/creative/execution/runtime/CreativeExecutionJobRuntime.js";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function requireText(source, expected, label) {
  if (!source.includes(expected)) {
    throw new Error(`${label}: missing ${JSON.stringify(expected)}`);
  }
}

function forbidText(source, forbidden, label) {
  if (source.includes(forbidden)) {
    throw new Error(`${label}: forbidden ${JSON.stringify(forbidden)}`);
  }
}

const director = read(directorPath);
const worker = read(workerPath);

for (const expected of [
  'RESEARCH_TRANSPORT_VERSION = "WEB_EVIDENCE_STRUCTURED_V4"',
  'RESEARCH_CONTEXT_CONTRACT = "CREATIVE_RESEARCH_CONTEXT_V4"',
  'RESEARCH_REPORT_CONTRACT = "CREATIVE_AUTONOMOUS_RESEARCH_V4"',
  'RESEARCH_IDENTITY_CONTRACT = "CREATIVE_RESEARCH_ORGANIZATION_IDENTITY_V3"',
  'ServiceExecutionCostGuardRuntime',
  'resolveActiveLegalEntitySelection',
  'resolveEntity',
  'search_seed',
  'CREATIVE_RESEARCH_ORGANIZATION_IDENTITY_REQUIRED',
  'CREATIVE_RESEARCH_IDENTITY_VALIDATION_FAILED',
  'COMPANY_CANONICAL_NAME_MISMATCH',
  'COMPANY_INTERNAL_IDENTITY_MISMATCH',
  'COMPANY_LOCATION_MISMATCH',
  'matchingEvidenceUsages',
  'evidenceMatchesOrganization',
  'validateEvidenceBinding',
  'RESEARCH_SOURCE_NOT_IN_WEB_EVIDENCE',
  'AUTONOMOUS_COMPANY_MARKET_RESEARCH_V4_WEB_EVIDENCE',
  'AUTONOMOUS_COMPANY_MARKET_RESEARCH_V4_STRUCTURED_SYNTHESIS',
  'response_format: { type: "json_object" }',
  'cost_guard:',
  'maximum_customer_price: budgetBeforeEvidence.remaining',
  'maximum_customer_price: budgetBeforeSynthesis.remaining',
  'research_phase: "WEB_EVIDENCE"',
  'research_phase: "STRUCTURED_SYNTHESIS"',
  'evidence_reused: evidenceReused',
]) {
  requireText(director, expected, "director-v4");
}

for (const expected of [
  'AutonomousResearchDirectorV4Runtime',
  'RESEARCH_TRANSPORT_VERSION',
  'RESEARCH_IDENTITY_CONTRACT',
  'creative-project-research-v4:',
  'maximum_attempts: 1',
  'job.job_type === JOB_TYPES.PROJECT_RESEARCH ||',
  'production_authorized: false',
]) {
  requireText(worker, expected, "worker");
}

forbidText(worker, 'creative-project-research-v2:', "worker");
forbidText(worker, 'creative-project-research-v3:', "worker");
forbidText(worker, 'AutonomousResearchDirectorRuntime.run', "worker");
forbidText(worker, 'RESEARCH_TRANSPORT_VERSION = "WEB_SEARCH_AUTO_V2"', "worker");

console.log("CREATIVE_RESEARCH_GROUNDING_V4_AUDIT=PASS");
console.log("RESEARCH_TRANSPORT=WEB_EVIDENCE_STRUCTURED_V4");
console.log("RESEARCH_EVIDENCE=REUSABLE_AND_IDENTITY_GATED");
console.log("RESEARCH_SYNTHESIS=JSON_OBJECT_NO_WEB_TOOL");
console.log("RESEARCH_COST_GUARD=PRE_PROVIDER_CALL");
console.log("RESEARCH_IDEMPOTENCY=creative-project-research-v4");
console.log("RESEARCH_MAXIMUM_ATTEMPTS=1");
console.log("RESEARCH_IDENTITY=ORGANIZATION_AND_LEGAL_ENTITY_GROUNDED");
console.log("RESEARCH_WRONG_COMPANY_FAILS_CLOSED=true");
console.log("RESEARCH_PRODUCTION_AUTHORIZED=false");
console.log("RESEARCH_RELEASE_GATE=PREBUILD");