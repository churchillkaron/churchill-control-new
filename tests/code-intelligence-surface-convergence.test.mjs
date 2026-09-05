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
const studioSurface = await readFile(
  "components/creative/code/CreativeCodeStudio.jsx",
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
  assert.match(businessPartnerCodeSurface, /\/api\/operator\/code\/progress/);
  assert.match(
    businessPartnerCodeSurface,
    /data-avantiqo-business-partner-code-mission="true"/,
  );
  assert.match(
    businessPartnerCodeSurface,
    /data-avantiqo-open-code-studio="true"/,
  );
  assert.match(businessPartnerCodeSurface, /latest_verification_passed/);
  assert.match(businessPartnerCodeSurface, /Open Code Studio/);
  assert.match(businessPartnerCodeSurface, /RECENT_VISIBLE_MS/);
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
});
