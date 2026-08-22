import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  reasoningService,
  reasoningRuntime,
  directorEngine,
  marketingProduction,
  providerResolver,
  providerExecutor,
  imageRegistration,
  imageWorker,
  audioRegistration,
  codeRegistration,
  cinemaProvider,
  cinemaWorker,
  ownedWorker,
  productionTaskDocument,
  productionMaterializer,
  creativeServiceResolver,
] = await Promise.all([
  readFile("lib/creative/reasoning/CreativeReasoningService.js", "utf8"),
  readFile("lib/creative/reasoning/runtime/CreativeReasoningRuntime.js", "utf8"),
  readFile("lib/creative/runtime/engines/DirectorEngine.js", "utf8"),
  readFile("lib/marketing/ai/intelligence/ProductionEngine.js", "utf8"),
  readFile("lib/platform/service-runtime/providers/ProviderResolver.js", "utf8"),
  readFile("lib/platform/service-runtime/providers/ProviderExecutorCore.js", "utf8"),
  readFile("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProviderRegistration.js", "utf8"),
  readFile("services/avantiqo-image-engine/handler.py", "utf8"),
  readFile("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js", "utf8"),
  readFile("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProviderRegistration.js", "utf8"),
  readFile("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProvider.js", "utf8"),
  readFile("services/avantiqo-video-engine/handler.py", "utf8"),
  readFile("lib/platform/service-runtime/providers/avantiqo-owned/AvantiqoOwnedRunpodWorker.js", "utf8"),
  readFile("lib/operations/tasks/documents/ProductionTask.js", "utf8"),
  readFile("lib/creative/execution/runtime/CreativeProductionTaskMaterializationRuntime.js", "utf8"),
  readFile("lib/creative/services/CreativeServiceResolver.js", "utf8"),
]);

test("Creative reasoning requests capabilities rather than providers", () => {
  assert.match(reasoningService, /service_id:\s*"ai\.reasoning\.execute"/);
  assert.doesNotMatch(reasoningService, /provider_id\s*:/);
  assert.doesNotMatch(reasoningService, /AVANTIQO_REASONING_PROVIDER/);
  assert.match(reasoningService, /capability_only_orchestration:\s*true/);
});

test("Creative mission state never persists raw reasoning or provider identity", () => {
  assert.match(reasoningRuntime, /decision_trace:\s*\[\]/);
  assert.match(reasoningRuntime, /raw_reasoning_persisted:\s*false/);
  assert.match(reasoningRuntime, /provider_selection_persisted:\s*false/);
  assert.doesNotMatch(reasoningRuntime, /reasoning_trace/);
  assert.doesNotMatch(reasoningRuntime, /result\.reasoning/);
  assert.doesNotMatch(reasoningRuntime, /result\.provider/);
  assert.doesNotMatch(reasoningRuntime, /result\.model/);
});

test("Creative planning persists canonical capabilities, never provider policy", () => {
  assert.match(reasoningRuntime, /capability_needed/);
  assert.match(reasoningRuntime, /CAPABILITY_ONLY_SERVICE_RUNTIME_OWNED_FIRST/);
  assert.doesNotMatch(reasoningRuntime, /providerPolicy/);
  assert.doesNotMatch(reasoningRuntime, /provider_capability_needed/);
  assert.doesNotMatch(reasoningRuntime, /provider_policy:/);
  assert.doesNotMatch(directorEngine, /Select optimal AI providers/);
  assert.match(directorEngine, /canonical production capabilities/);
  assert.match(marketingProduction, /capability_needed/);
  assert.doesNotMatch(marketingProduction, /provider_capability_needed/);
});

test("Service Runtime is the owned-first provider boundary", () => {
  assert.match(providerResolver, /ownedProviderForCapability/);
  assert.match(providerResolver, /ownedCandidates\.length \? ownedCandidates : candidates/);
  assert.match(providerResolver, /external_fallback_selected/);
  assert.match(providerExecutor, /avantiqo_image/);
  assert.match(providerExecutor, /avantiqo_video/);
  assert.match(providerExecutor, /avantiqo_audio/);
  assert.match(providerExecutor, /avantiqo_code/);
});

test("owned provider registrations remain certification-gated", () => {
  assert.match(imageRegistration, /certifiedCapabilities/);
  assert.match(imageRegistration, /implemented_capabilities/);
  assert.match(imageRegistration, /runtimeAvailable = Boolean/);
  assert.match(imageRegistration, /foundation_model_configured/);

  for (const source of [audioRegistration, codeRegistration]) {
    assert.match(source, /CERTIFIED_CAPABILITIES/);
    assert.match(source, /foundationModel/);
    assert.match(source, /runtimeAvailable = Boolean/);
    assert.match(source, /foundation_model_configured/);
  }
});

test("owned Image requires cached model families before inference", () => {
  assert.match(imageWorker, /AVANTIQO_IMAGE_REQUIRE_CACHED_MODEL/);
  assert.match(imageWorker, /AVANTIQO_IMAGE_CACHED_MODEL_REQUIRED/);
  assert.match(imageWorker, /local_files_only=bool\(cached_path\)/);
  assert.match(imageWorker, /foundation_model_source/);
  assert.match(imageWorker, /ai\.image\.inpaint/);
  assert.match(imageWorker, /ai\.image\.outpaint/);
});

test("Cinema validates capability and keeps certification execution fail-closed", () => {
  assert.match(cinemaProvider, /CERTIFIED_CAPABILITIES/);
  assert.match(cinemaProvider, /capability,/);
  assert.match(cinemaProvider, /AVANTIQO_VIDEO_IMAGE_TO_VIDEO_REFERENCE_REQUIRED/);
  assert.match(cinemaWorker, /DEFAULT_CERTIFIED_CAPABILITIES/);
  assert.match(cinemaWorker, /_configured_capabilities/);
  assert.match(cinemaWorker, /AVANTIQO_VIDEO_CAPABILITY_NOT_CERTIFIED/);
  assert.match(cinemaWorker, /AVANTIQO_VIDEO_CERTIFICATION_EXECUTION_ENABLED/);
  assert.match(cinemaWorker, /"0"/);
  assert.match(cinemaWorker, /data\.get\("certification_execution"\) is True/);
  assert.match(cinemaWorker, /raw_reasoning_persisted/);
});

test("Studio materialization preserves exact owned media task semantics", () => {
  for (const taskType of [
    "EDIT_IMAGE",
    "INPAINT_IMAGE",
    "OUTPAINT_IMAGE",
    "VIDEO_TO_VIDEO",
    "EDIT_VIDEO",
  ]) {
    assert.match(productionTaskDocument, new RegExp(`${taskType}: \\"${taskType}\\"`));
    assert.match(productionMaterializer, new RegExp(`PRODUCTION_TASK_TYPES\\.${taskType}`));
  }
  assert.match(productionMaterializer, /capability === "ai\.image\.edit"/);
  assert.match(productionMaterializer, /capability === "ai\.image\.inpaint"/);
  assert.match(productionMaterializer, /capability === "ai\.image\.outpaint"/);
  assert.match(productionMaterializer, /capability === "ai\.video\.video_to_video"/);
  assert.match(productionMaterializer, /capability === "ai\.video\.edit"/);
  assert.match(creativeServiceResolver, /EDIT_IMAGE:\s*"ai\.image\.edit"/);
  assert.match(creativeServiceResolver, /INPAINT_IMAGE:\s*"ai\.image\.inpaint"/);
  assert.match(creativeServiceResolver, /OUTPAINT_IMAGE:\s*"ai\.image\.outpaint"/);
  assert.match(creativeServiceResolver, /VIDEO_TO_VIDEO:\s*"ai\.video\.video_to_video"/);
  assert.match(creativeServiceResolver, /EDIT_VIDEO:\s*"ai\.video\.edit"/);
});

test("owned worker transport strips private reasoning fields", () => {
  assert.match(ownedWorker, /reasoning_content/);
  assert.match(ownedWorker, /chain_of_thought/);
  assert.match(ownedWorker, /scratchpad/);
  assert.match(ownedWorker, /raw_reasoning_persisted:\s*false/);
});
