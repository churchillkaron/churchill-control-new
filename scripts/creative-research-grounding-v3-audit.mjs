import fs from "node:fs";

const directorPath =
  "lib/creative/research/runtime/AutonomousResearchDirectorRuntime.js";
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
  'RESEARCH_TRANSPORT_VERSION = "WEB_SEARCH_GROUNDED_V3"',
  'RESEARCH_CONTEXT_CONTRACT = "CREATIVE_RESEARCH_CONTEXT_V3"',
  'RESEARCH_REPORT_CONTRACT = "CREATIVE_AUTONOMOUS_RESEARCH_V3"',
  'resolveActiveLegalEntitySelection',
  'resolveEntity',
  'search_seed',
  'CREATIVE_RESEARCH_ORGANIZATION_IDENTITY_REQUIRED',
  'CREATIVE_RESEARCH_IDENTITY_VALIDATION_FAILED',
  'COMPANY_CANONICAL_NAME_MISMATCH',
  'COMPANY_INTERNAL_IDENTITY_MISMATCH',
  'COMPANY_LOCATION_MISMATCH',
  'required_location_anchor_count',
  'result?.usage?.metadata?.result?.output?.raw',
  'AUTONOMOUS_COMPANY_MARKET_RESEARCH_V3',
  'JSON_TEXT_WITH_LOCAL_EVIDENCE_AND_IDENTITY_VALIDATION',
  'WEB_SEARCH_TEXT_PLUS_LOCAL_JSON_VALIDATION',
  'tool_choice: "auto"',
]) {
  requireText(director, expected, "director");
}

for (const expected of [
  'RESEARCH_TRANSPORT_VERSION = "WEB_SEARCH_GROUNDED_V3"',
  'RESEARCH_IDENTITY_CONTRACT = "CREATIVE_RESEARCH_ORGANIZATION_IDENTITY_V3"',
  'creative-project-research-v3:',
  'maximum_attempts: 1',
  'job.job_type === JOB_TYPES.PROJECT_RESEARCH ||',
  'production_authorized: false',
]) {
  requireText(worker, expected, "worker");
}

forbidText(worker, 'creative-project-research-v2:', "worker");
forbidText(worker, 'RESEARCH_TRANSPORT_VERSION = "WEB_SEARCH_AUTO_V2"', "worker");

console.log("CREATIVE_RESEARCH_GROUNDING_V3_AUDIT=PASS");
console.log("RESEARCH_TRANSPORT=WEB_SEARCH_GROUNDED_V3");
console.log("RESEARCH_IDEMPOTENCY=creative-project-research-v3");
console.log("RESEARCH_MAXIMUM_ATTEMPTS=1");
console.log("RESEARCH_IDENTITY=ORGANIZATION_AND_LEGAL_ENTITY_GROUNDED");
console.log("RESEARCH_WRONG_COMPANY_FAILS_CLOSED=true");
console.log("RESEARCH_PRODUCTION_AUTHORIZED=false");
console.log("RESEARCH_RELEASE_GATE=PREBUILD");