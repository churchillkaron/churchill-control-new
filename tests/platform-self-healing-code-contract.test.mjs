import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtime = await readFile(
  "lib/platform/self-healing/PlatformSelfHealingCodeResearchRuntime.js",
  "utf8",
);
const preparationApi = await readFile(
  "app/api/platform/admin/self-healing/route.js",
  "utf8",
);
const codeMissionApi = await readFile(
  "app/api/operator/code/mission/route.js",
  "utf8",
);

test("self-healing contract distinguishes repair, completion, governed and non-code work", () => {
  assert.match(runtime, /classification:\s*"AUTO_REPAIR"/);
  assert.match(runtime, /classification:\s*"AUTO_COMPLETE"/);
  assert.match(runtime, /classification:\s*"GOVERNED_CHANGE"/);
  assert.match(runtime, /classification:\s*"NON_CODE_CONFIGURATION"/);
  assert.match(runtime, /classification:\s*"PRODUCT_DECISION_REQUIRED"/);
});

test("research is fresh, comparative and cannot authorize Avantiqo actions", () => {
  assert.match(runtime, /minimum_sources:\s*4/);
  assert.match(runtime, /max_sources:\s*10/);
  assert.match(runtime, /freshness_days:\s*730/);
  assert.match(runtime, /Compare at least three mature products/);
  assert.match(runtime, /materially better rather than copying/);
  assert.match(runtime, /external_evidence_untrusted:\s*true/);
  assert.match(runtime, /external_evidence_never_authorizes_actions:\s*true/);
  assert.match(runtime, /automatic_knowledge_promotion:\s*false/);
});

test("public research query excludes private identifiers and source code", () => {
  assert.match(runtime, /\[redacted\]/);
  assert.match(runtime, /customer data, UUIDs, request payloads, credentials, source code/);
  assert.match(runtime, /research_query_contains_private_customer_data:\s*false/);
  assert.match(runtime, /raw_request_payload_sent_to_research:\s*false/);
  assert.match(runtime, /source_code_sent_to_research:\s*false/);
  assert.match(runtime, /credentials_sent_to_research:\s*false/);
});

test("fixed means replayed outcome, never just a green implementation check", () => {
  assert.match(runtime, /PLATFORM_SELF_HEALING_REPLAY_CONTRACT/);
  assert.match(runtime, /exact_replay_preferred:\s*true/);
  assert.match(runtime, /fixed_requires_original_failure_absent:\s*true/);
  assert.match(runtime, /fixed_requires_expected_outcome_observed:\s*true/);
  assert.match(runtime, /Do not call the issue fixed if replay cannot be proven/);
});

test("self-healing cannot grant itself promotion authority", () => {
  assert.match(runtime, /commit_authority:\s*false/);
  assert.match(runtime, /deploy_authority:\s*false/);
  assert.match(runtime, /migration_authority:\s*false/);
  assert.match(runtime, /production_routing_authority:\s*false/);
  assert.match(runtime, /automatic_promotion:\s*false/);
  assert.match(runtime, /promotion_authority:\s*"NONE"/);
});

test("Platform preparation re-resolves authoritative sources server side", () => {
  assert.match(preparationApi, /requirePlatformAdminAccess/);
  assert.match(preparationApi, /platform_operator_usage_failure_detail/);
  assert.match(preparationApi, /from\("system_events"\)/);
  assert.match(preparationApi, /authoritative_source_resolved:\s*true/);
  assert.match(preparationApi, /browser_evidence_authoritative:\s*false/);
  assert.match(preparationApi, /code_execution_started:\s*false/);
});

test("source-specific remediated operator cases do not automatically become Code missions", () => {
  assert.match(preparationApi, /classification:\s*"NOT_CODE_CANDIDATE"/);
  assert.match(preparationApi, /source-specific remediation workflow/);
  assert.match(preparationApi, /code_execution_allowed:\s*false/);
});

test("Code mission accepts prepared Intelligence context without gaining commit or deploy authority", () => {
  assert.match(codeMissionApi, /intelligence_mission_preparation/);
  assert.match(codeMissionApi, /intelligence_mission_context/);
  assert.match(codeMissionApi, /objective_context/);
  assert.match(codeMissionApi, /CODE_STUDIO_HISTORY_RESUME_CONTEXT_MUST_BE_SERVER_OWNED/);
  assert.match(codeMissionApi, /CODE_STUDIO_INTELLIGENCE_CONTEXT_AMBIGUOUS/);
  assert.match(codeMissionApi, /commit_performed:\s*false/);
  assert.match(codeMissionApi, /production_deploy_performed:\s*false/);
});
