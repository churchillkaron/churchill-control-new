import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const router = fs.readFileSync(
  "lib/creative/video/runtime/CreativeVideoEngineRouter.js",
  "utf8",
);
const dispatch = fs.readFileSync(
  "lib/creative/video/runtime/CreativeVideoProductionDispatchBootstrap.js",
  "utf8",
);
const productionRuntime = fs.readFileSync(
  "lib/creative/production/runtime/ProductionRuntime.js",
  "utf8",
);
const productionQueueRoute = fs.readFileSync(
  "app/api/creative/production/queue/route.js",
  "utf8",
);
const executionPlanner = fs.readFileSync(
  "lib/creative/execution/planner/ExecutionPlanner.js",
  "utf8",
);
const taskMaterialization = fs.readFileSync(
  "lib/creative/execution/runtime/CreativeProductionTaskMaterializationRuntime.js",
  "utf8",
);
const providerResolver = fs.readFileSync(
  "lib/platform/service-runtime/providers/ProviderResolver.js",
  "utf8",
);
const ownedPolicy = fs.readFileSync(
  "lib/platform/service-runtime/providers/AvantiqoOwnedProviderPolicy.js",
  "utf8",
);
const serviceExecution = fs.readFileSync(
  "lib/platform/service-runtime/execution/ServiceExecutionRuntime.js",
  "utf8",
);
const ownedCertification = fs.readFileSync(
  "lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js",
  "utf8",
);

test("Creative Cinema routing delegates vendor selection to Service Runtime", () => {
  assert.match(router, /CREATIVE_VIDEO_EXECUTION_ROUTE_V3/);
  assert.match(router, /SERVICE_RUNTIME_OWNED_FIRST_CAPABILITY_SELECTION/);
  assert.match(router, /provider_selection_boundary:\s*"SERVICE_RUNTIME_ONLY"/);
  assert.match(router, /owned_first_required:\s*true/);
  assert.match(router, /creative_provider_selection_forbidden:\s*true/);
  assert.match(router, /external_provider_role:\s*"SUPPLEMENTAL_OR_FALLBACK_ONLY"/);
  assert.match(router, /CREATIVE_VIDEO_PROVIDER_SELECTION_FORBIDDEN/);

  for (const vendor of [
    "google-veo",
    "gemini",
    "seedance",
    "runway",
    "fal-ai/veo",
  ]) {
    assert.equal(
      router.includes(vendor),
      false,
      `Creative router must not select vendor ${vendor}`,
    );
  }
});

test("every ai.video capability enters the canonical Cinema dispatch boundary", () => {
  assert.match(dispatch, /capability\.startsWith\("ai\.video\."\)/);
  assert.match(dispatch, /input:\s*\{[\s\S]*capability,[\s\S]*shot_bible:\s*shotBible/);
  assert.match(dispatch, /provider_id:\s*null/);
  assert.match(dispatch, /video_provider_selection_owner:\s*"SERVICE_RUNTIME"/);
  assert.match(dispatch, /creative_provider_selection_forbidden:\s*true/);
  assert.match(dispatch, /stripCreativeProviderPins/);

  for (const field of [
    "allowed_providers",
    "preferred_providers",
    "preferred_models",
  ]) {
    assert.match(dispatch, new RegExp(`${field}:\\s*_`));
  }
});

test("shared Creative ProductionRuntime installs the canonical Cinema boundary", () => {
  assert.match(
    productionRuntime,
    /CreativeVideoProductionDispatchBootstrap/,
  );
  assert.match(
    productionRuntime,
    /CreativeShotCandidateQualityGateBootstrap/,
  );
  assert.match(
    productionRuntime,
    /ProductionQueueRuntime\.dispatchAll/,
  );

  assert.match(
    productionQueueRoute,
    /CreativeVideoProductionDispatchBootstrap/,
  );
  assert.match(
    productionQueueRoute,
    /CreativeShotCandidateQualityGateBootstrap/,
  );
  assert.match(
    productionQueueRoute,
    /ProductionQueueRuntime\.dispatchAll/,
  );
});

test("Cinema boundary resolves Studio shot identity before dispatch", () => {
  assert.match(dispatch, /function videoShotId/);
  assert.match(dispatch, /task\.shot_id\s*\|\|/);
  assert.match(dispatch, /task\.metadata\?\.shot_id/);
  assert.match(dispatch, /task\.input\?\.shot_id/);
  assert.match(dispatch, /ShotRepository\.get\(shotId\)/);
  assert.match(dispatch, /shot_id:\s*shotId/);
  assert.match(dispatch, /task:\s*\{\s*\.\.\.task,\s*shot_id:\s*shotId\s*\}/);
});

test("temporal film shots materialize canonical ai.video production tasks", () => {
  assert.match(
    executionPlanner,
    /capability:\s*generation\.capability\s*\|\|\s*generation\.service/,
  );
  assert.match(
    executionPlanner,
    /shot_id:\s*node\.metadata\?\.shot_id\s*\|\|\s*null/,
  );
  assert.match(taskMaterialization, /shot_id:\s*shotIdFor\(node\)/);
  assert.match(
    taskMaterialization,
    /shot_id:\s*data\.shot_id\s*\|\|\s*contract\.shot_id\s*\|\|\s*null/,
  );
  assert.match(
    taskMaterialization,
    /capability:\s*data\.capability\s*\|\|\s*contract\.capability\s*\|\|\s*null/,
  );
  assert.match(
    taskMaterialization,
    /if \(capability\.includes\("video"\)\) return PRODUCTION_TASK_TYPES\.GENERATE_VIDEO/,
  );
});

test("Service Runtime preserves exact requested capability before provider resolution", () => {
  assert.match(
    serviceExecution,
    /input\.capability\s*\|\|\s*payload\.capability/,
  );
  assert.match(
    serviceExecution,
    /capability:\s*executionCapability/,
  );
  assert.match(
    serviceExecution,
    /resolvedCapabilities\.includes\(requestedCapability\)/,
  );
});

test("owned provider policy owns all ai.video capabilities", () => {
  assert.match(
    ownedPolicy,
    /key\.startsWith\("ai\.video\."\)\) return "avantiqo-video"/,
  );
  assert.match(ownedPolicy, /selection_boundary:\s*"SERVICE_RUNTIME_ONLY"/);
  assert.match(ownedPolicy, /external_providers:\s*"OPTIONAL_FALLBACK_ONLY"/);
});

test("Cinema requirements are filtered before owned-first ranking", () => {
  assert.match(providerResolver, /providerMeetsVideoRequirements/);
  assert.match(providerResolver, /policy\.video_requirements/);
  assert.match(providerResolver, /allowed_duration_seconds/);
  assert.match(providerResolver, /supported_resolutions/);
  assert.match(providerResolver, /exact_last_frame_required/);
  assert.match(providerResolver, /source_tail_continuation/);
  assert.match(providerResolver, /localized_mask_video_editing/);
  assert.match(providerResolver, /owned_super_resolution/);
  assert.match(providerResolver, /owned_audio_conditioned_lipsync/);
  assert.match(
    providerResolver,
    /ownedCandidates\.length \? ownedCandidates : candidates/,
  );
  assert.match(providerResolver, /ownedExecutionCertification/);
});

test("owned execution certification remains a hard eligibility gate", () => {
  assert.match(ownedCertification, /PRODUCTION_CERTIFIED/);
  assert.match(ownedCertification, /benchmark_certified/);
  assert.match(ownedCertification, /economics_certified/);
  assert.match(ownedCertification, /model_license_verified/);
});
