import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const provider = await readFile(
  "lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProviderRegistration.js",
  "utf8",
);
const studioRoute = await readFile(
  "app/api/operator/code/mission/route.js",
  "utf8",
);
const interventionRoute = await readFile(
  "app/api/operator/code/intervention/route.js",
  "utf8",
);
const historyRoute = await readFile(
  "app/api/operator/code/history/route.js",
  "utf8",
);
const interventionRuntime = await readFile(
  "lib/code/runtime/CodeAIOwnerInterventionRuntime.js",
  "utf8",
);
const historyRuntime = await readFile(
  "lib/code/runtime/CodeAIMissionHistoryRuntime.js",
  "utf8",
);
const workPackageRuntime = await readFile(
  "lib/code/runtime/CodeAIWorkPackageRuntime.js",
  "utf8",
);
const studioSurface = await readFile(
  "components/creative/code/CreativeCodeStudio.jsx",
  "utf8",
);
const studioPage = await readFile(
  "app/(system)/workspace/[organizationId]/creative/code/page.jsx",
  "utf8",
);
const homeSurface = await readFile(
  "app/(system)/workspace/[organizationId]/page.jsx",
  "utf8",
);
const businessPartnerCodeSurface = await readFile(
  "components/operator/BusinessPartnerCodeMissionPanel.jsx",
  "utf8",
);
const businessPartnerActiveCodeSurface = await readFile(
  "components/operator/BusinessPartnerActiveCodeMissionPanel.jsx",
  "utf8",
);
const missionHistorySurface = await readFile(
  "components/operator/CodeMissionHistoryPanel.jsx",
  "utf8",
);
const businessPartnerPolicy = await readFile(
  "lib/operator/runtime/OperatorSelfEngineeringPolicy.js",
  "utf8",
);
const productEngineering = await readFile(
  "lib/platform/capabilities/createProductEngineeringCycleCapability.js",
  "utf8",
);

const CERTIFICATION = "AVANTIQO_CODE_QWEN38_PRIVATE12_CERT_V17";
const RUNTIME = "AVANTIQO_CODE_QWEN38_CANARY_RUNTIME_V10";

test("registered Avantiqo Code provider exposes the certified V17 runtime identity", () => {
  assert.match(provider, new RegExp(CERTIFICATION));
  assert.match(provider, new RegExp(RUNTIME));
  assert.match(provider, /certification_status:\s*"PASS"/);
  assert.match(provider, /certified_repository_agent:\s*"repo_agent_v15"/);
  assert.match(provider, /method:\s*"mtp"/);
  assert.match(provider, /external_provider_fallback_allowed:\s*false/);
});

test("Code Studio is bound to the same certified Avantiqo Code identity", () => {
  assert.match(studioRoute, /AVANTIQO_CODE_CERTIFICATION_CONTRACT/);
  assert.match(studioRoute, /AVANTIQO_CODE_CERTIFIED_RUNTIME_CONTRACT/);
  assert.match(studioRoute, /certification_contract:/);
  assert.match(studioRoute, /certified_runtime_contract:/);
  assert.match(studioRoute, /createCodeAIAutonomousCapability/);
  assert.match(studioRoute, /production_routing_activated:\s*false/);
  assert.match(studioRoute, /commit_performed:\s*false/);
  assert.match(studioRoute, /production_deploy_performed:\s*false/);
});

test("Code Studio follows shared governed Code missions and keeps Business Partner as the steering surface", () => {
  assert.match(studioSurface, /\/api\/operator\/code\/progress/);
  assert.match(studioSurface, /progressIsActive/);
  assert.match(studioSurface, /data-avantiqo-shared-code-mission="true"/);
  assert.match(studioSurface, /data-avantiqo-business-partner-link="true"/);
  assert.match(studioSurface, /Steer in Business Partner/);
  assert.match(studioSurface, /Following active mission/);
  assert.match(studioSurface, /no commit · no deploy/);
});

test("Home Business Partner remains the primary operator surface and exposes Code mission evidence", () => {
  assert.match(homeSurface, /BusinessPartnerCodeMissionPanel/);
  assert.match(homeSurface, /Business Partner/);
  assert.match(homeSurface, /One operator\. Every capability\./);
  assert.match(
    homeSurface,
    /Ask, steer and verify work here\. Code missions stay synchronized with Code Studio\./,
  );
  assert.match(businessPartnerCodeSurface, /BusinessPartnerActiveCodeMissionPanel/);
  assert.match(businessPartnerCodeSurface, /CodeMissionHistoryPanel/);
  assert.match(businessPartnerCodeSurface, /data-avantiqo-business-partner-code-workspace="true"/);
  assert.match(businessPartnerActiveCodeSurface, /\/api\/operator\/code\/progress/);
  assert.match(businessPartnerActiveCodeSurface, /data-avantiqo-business-partner-code-mission="true"/);
  assert.match(businessPartnerActiveCodeSurface, /data-avantiqo-open-code-studio="true"/);
  assert.match(businessPartnerActiveCodeSurface, /latest_verification_passed/);
  assert.match(businessPartnerActiveCodeSurface, /Open Code Studio/);
  assert.match(businessPartnerActiveCodeSurface, /RECENT_VISIBLE_MS/);
});

test("Business Partner can steer the same active Code mission at governed safe boundaries", () => {
  assert.match(businessPartnerActiveCodeSurface, /\/api\/operator\/code\/intervention/);
  assert.match(businessPartnerActiveCodeSurface, /data-avantiqo-code-steering="true"/);
  assert.match(businessPartnerActiveCodeSurface, /next safe engineering boundary/i);
  assert.match(businessPartnerActiveCodeSurface, /same mission/i);
  assert.match(interventionRoute, /loadCodeAILiveProgress/);
  assert.match(interventionRoute, /LIVE_MISSION_MISMATCH/);
  assert.match(interventionRoute, /queued_for_safe_boundary/);
  assert.match(workPackageRuntime, /claimPendingCodeAIOwnerIntervention/);
  assert.match(workPackageRuntime, /LATEST OWNER STEERING/);
  assert.match(workPackageRuntime, /owner_intervention_starts_second_mission:\s*false/);
  assert.match(workPackageRuntime, /applied_at_safe_boundary/);
});

test("Business Partner exposes delta visibility and verified preview review without granting persistence authority", () => {
  assert.match(businessPartnerActiveCodeSurface, /steerBaseline/);
  assert.match(businessPartnerActiveCodeSurface, /Since then:/);
  assert.match(businessPartnerActiveCodeSurface, /data-avantiqo-code-review="true"/);
  assert.match(businessPartnerActiveCodeSurface, /Approve preview/);
  assert.match(businessPartnerActiveCodeSurface, /Request changes/);
  assert.match(businessPartnerActiveCodeSurface, /no commit or deploy authority/i);
  assert.match(interventionRoute, /APPROVE_PATCH/);
  assert.match(interventionRoute, /latest_verification_passed !== true/);
  assert.match(interventionRoute, /persistent_source_changed:\s*false/);
  assert.match(interventionRoute, /commit_performed:\s*false/);
  assert.match(interventionRoute, /production_deploy_performed:\s*false/);
  assert.match(interventionRuntime, /authorization_effect:\s*"NONE"/);
  assert.match(interventionRuntime, /commit_authority:\s*false/);
  assert.match(interventionRuntime, /production_deploy_authority:\s*false/);
});

test("Code mission history is actor-scoped, attested and hides raw resume state from history clients", () => {
  assert.match(historyRuntime, /CODE_AI_MISSION_HISTORY_CONTRACT/);
  assert.match(historyRuntime, /verifyCodeMissionStateAttestation/);
  assert.match(historyRuntime, /metadata\.actor_id/);
  assert.match(historyRuntime, /raw_resume_state_returned:\s*false/);
  assert.match(historyRuntime, /raw_reasoning_returned:\s*false/);
  assert.match(historyRuntime, /commit_attempted/);
  assert.match(historyRoute, /requireOrganizationAccess/);
  assert.match(historyRoute, /raw_resume_state_returned:\s*false/);
  assert.match(historyRoute, /raw_reasoning_returned:\s*false/);
  assert.match(historyRoute, /commit_authority:\s*false/);
  assert.match(historyRoute, /production_deploy_authority:\s*false/);
});

test("Business Partner and Code Studio expose the same persistent resumable Code mission history", () => {
  assert.match(businessPartnerCodeSurface, /CodeMissionHistoryPanel/);
  assert.match(studioPage, /CodeMissionHistoryPanel/);
  assert.match(missionHistorySurface, /\/api\/operator\/code\/history/);
  assert.match(missionHistorySurface, /data-avantiqo-code-mission-history="true"/);
  assert.match(missionHistorySurface, /data-avantiqo-resume-code-mission="true"/);
  assert.match(missionHistorySurface, /Continue mission/);
  assert.match(missionHistorySurface, /Final diff/);
  assert.match(missionHistorySurface, /interventions/);
  assert.match(missionHistorySurface, /tests/);
});

test("historical continuation restores the server-owned attested state and original execution key", () => {
  assert.match(studioRoute, /loadCodeAIMissionResumeSnapshot/);
  assert.match(studioRoute, /resume_mission_id/);
  assert.match(studioRoute, /CODE_STUDIO_HISTORY_RESUME_STATE_MUST_BE_SERVER_OWNED/);
  assert.match(studioRoute, /snapshot\.execution_key/);
  assert.match(studioRoute, /snapshot\.resume_state/);
  assert.match(studioRoute, /resumed_from_history/);
  assert.match(historyRuntime, /CODE_AI_MISSION_HISTORY_PERSISTENCE_ALREADY_ATTEMPTED/);
  assert.match(historyRuntime, /integrity_verified:\s*true/);
  assert.match(historyRuntime, /commit_authority:\s*false/);
  assert.match(historyRuntime, /production_deploy_authority:\s*false/);
});

test("Business Partner code requests converge through Product Engineering into Code AI", () => {
  assert.match(
    businessPartnerPolicy,
    /platform\.product_engineering_cycle\.execute/,
  );
  assert.match(
    businessPartnerPolicy,
    /Keep the Business Partner conversation as the control plane/,
  );
  assert.match(
    productEngineering,
    /capability_key:\s*"platform\.code_ai_autonomous\.execute"/,
  );
  assert.match(
    productEngineering,
    /capability_key:\s*"platform\.code_ai_autonomous_status\.verify"/,
  );
});

test("surface convergence does not grant production authority", () => {
  assert.match(provider, /production_routing_changed_by_certification:\s*false/);
  assert.match(studioRoute, /production_routing_activated:\s*false/);
  assert.match(studioRoute, /pricing_activated:\s*false/);
  assert.match(studioRoute, /external_fallback_allowed:\s*false/);
  assert.match(productEngineering, /productionDeploymentAllowed:\s*false/);
  assert.match(productEngineering, /databaseMigrationExecutionAllowed:\s*false/);
  assert.match(interventionRoute, /commit_authority:\s*false/);
  assert.match(interventionRoute, /production_deploy_authority:\s*false/);
  assert.match(historyRoute, /commit_authority:\s*false/);
  assert.match(historyRoute, /production_deploy_authority:\s*false/);
});
