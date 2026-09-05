import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("self-healing execution accepts only researched and authoritatively classified missions", () => {
  const runtime = source(
    "lib/platform/self-healing/PlatformSelfHealingCodeExecutionRuntime.js",
  );

  assert.match(runtime, /PLATFORM_SELF_HEALING_CODE_RESEARCH_CONTRACT/);
  assert.match(runtime, /RESEARCHED_CODE_MISSION_READY/);
  assert.match(runtime, /prepared\.code_execution_allowed !== true/);
  assert.match(runtime, /classification_authority_source/);
  assert.match(runtime, /source !== "ERP_REGISTRY"/);
  assert.match(runtime, /SELF_HEALING_AUTHORITATIVE_CLASSIFICATION_REQUIRED/);
  assert.match(runtime, /PLATFORM_SELF_HEALING_REPLAY_CONTRACT/);
  assert.match(runtime, /fixed_requires_original_failure_absent !== true/);
  assert.match(runtime, /fixed_requires_expected_outcome_observed !== true/);
});

test("self-healing execution uses the canonical Code Employee and retains zero promotion authority", () => {
  const runtime = source(
    "lib/platform/self-healing/PlatformSelfHealingCodeExecutionRuntime.js",
  );

  assert.match(runtime, /executeCodeAIEmployeeMission/);
  assert.match(runtime, /repository_url:\s*REPOSITORY_URL/);
  assert.match(runtime, /ref:\s*REPOSITORY_REF/);
  assert.match(runtime, /commit_authority:\s*false/);
  assert.match(runtime, /deploy_authority:\s*false/);
  assert.match(runtime, /migration_authority:\s*false/);
  assert.match(runtime, /production_routing_authority:\s*false/);
  assert.match(runtime, /Return a verified engineering artifact only/);
  assert.match(runtime, /fixed:\s*false/);
  assert.match(runtime, /AUTHORITATIVE_ORIGINAL_ACTION_REPLAY_REQUIRED/);
});

test("self-healing execute route re-runs authoritative preparation instead of trusting client prepared data", () => {
  const route = source(
    "app/api/platform/admin/self-healing/execute/route.js",
  );

  assert.match(route, /requirePlatformAdminAccess/);
  assert.match(route, /POST as prepareSelfHealingMission/);
  assert.match(route, /prepareSelfHealingMission\(request\.clone\(\)\)/);
  assert.match(route, /prepared\.status !== "RESEARCHED_CODE_MISSION_READY"/);
  assert.match(route, /executePlatformSelfHealingCodeMission/);
  assert.match(route, /organizationId:\s*prepared\.organizationId/);
  assert.match(route, /browser_evidence_authoritative:\s*false/);
  assert.match(route, /commit_performed:\s*false/);
  assert.match(route, /production_deploy_performed:\s*false/);
  assert.match(route, /fixed:\s*false/);
});
