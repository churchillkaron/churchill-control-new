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
  cinemaRegistration,
  cinemaWorker,
  ownedWorker,
  productionTaskDocument,
  productionTaskRuntime,
  productionMaterializer,
  creativeServiceResolver,
  ownedCertificationPolicy,
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
  readFile("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js", "utf8"),
  readFile("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js", "utf8"),
  readFile("services/avantiqo-video-engine/handler.py", "utf8"),
  readFile("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoLocalQueueProvider.js", "utf8"),
  readFile("lib/operations/tasks/documents/ProductionTask.js", "utf8"),
  readFile("lib/operations/tasks/runtime/ProductionTaskRuntime.js", "utf8"),
  readFile("lib/creative/execution/runtime/CreativeProductionTaskMaterializationRuntime.js", "utf8"),
  readFile("lib/creative/services/CreativeServiceResolver.js", "utf8"),
  readFile("lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js", "utf8"),
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
  assert.match(providerResolver, /localOnlyCapability\(capability\)/);
  assert.match(providerResolver, /localOnlyCapability\(capability\) \? ownedCandidates/);
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
  assert.match(cinemaRegistration, /DEFAULT_CERTIFIED_CAPABILITIES/);
  assert.match(cinemaRegistration, /"ai\.video\.inpaint"/);
  assert.match(cinemaRegistration, /capability_foundation_models/);
  assert.match(cinemaRegistration, /"ai\.video\.inpaint": inpaintFoundationModel/);

  assert.match(audioRegistration, /AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES/);
  assert.match(audioRegistration, /runtimeAvailable:Boolean/);
  assert.match(audioRegistration, /local_only_execution:true/);
  assert.match(audioRegistration, /foundation_models:/);

  assert.match(codeRegistration, /AVANTIQO_CODE_CERTIFIED_CAPABILITIES/);
  assert.match(codeRegistration, /foundationModel/);
  assert.match(codeRegistration, /runtimeAvailable:/);
  assert.match(codeRegistration, /local_only_execution: true/);
});

test("owned Image requires cached model families before inference", () => {
  assert.match(imageWorker, /AVANTIQO_IMAGE_REQUIRE_CACHED_MODEL/);
  assert.match(imageWorker, /AVANTIQO_IMAGE_CACHED_MODEL_REQUIRED/);
  assert.match(imageWorker, /local_files_only=bool\(cached_path\)/);
  assert.match(imageWorker, /foundation_model_source/);
  assert.match(imageWorker, /ai\.image\.inpaint/);
  assert.match(imageWorker, /ai\.image\.outpaint/);
});

test("Cinema validates capability and keeps local execution fail-closed", () => {
  assert.match(cinemaProvider, /ROUTED_MASTERED_CAPABILITIES/);
  assert.match(cinemaProvider, /ADVANCED_CAPABILITIES/);
  assert.match(cinemaProvider, /STUDIO_VISUAL_GENERATION_MASTER_LOCKED/);
  assert.match(cinemaProvider, /AVANTIQO_VIDEO_LOCAL_ENGINE_NOT_IMPLEMENTED/);
  assert.match(cinemaProvider, /AVANTIQO_VIDEO_LOCAL_CAPABILITY_NOT_IMPLEMENTED/);
  assert.match(cinemaProvider, /AvantiqoVideoLocalQueueProvider/);
  assert.doesNotMatch(cinemaProvider, /selectedAssets|Modal|RunPod/);
  assert.match(cinemaWorker, /DEFAULT_CERTIFIED_CAPABILITIES/);
  assert.match(cinemaWorker, /AVANTIQO_VIDEO_CAPABILITY_NOT_CERTIFIED/);
  assert.match(cinemaWorker, /AVANTIQO_VIDEO_CERTIFICATION_EXECUTION_ENABLED/);
  assert.match(cinemaWorker, /raw_reasoning_persisted/);
});

test("Studio materialization preserves exact owned media task semantics", () => {
  for (const taskType of [
    "EDIT_IMAGE",
    "INPAINT_IMAGE",
    "OUTPAINT_IMAGE",
    "VIDEO_TO_VIDEO",
    "EDIT_VIDEO",
    "INPAINT_VIDEO",
  ]) {
    assert.match(productionTaskDocument, new RegExp(`${taskType}: \\"${taskType}\\"`));
    assert.match(productionMaterializer, new RegExp(`PRODUCTION_TASK_TYPES\\.${taskType}`));
  }
  assert.match(productionMaterializer, /capability === "ai\.image\.edit"/);
  assert.match(productionMaterializer, /capability === "ai\.image\.inpaint"/);
  assert.match(productionMaterializer, /capability === "ai\.image\.outpaint"/);
  assert.match(productionMaterializer, /capability === "ai\.video\.video_to_video"/);
  assert.match(productionMaterializer, /capability === "ai\.video\.edit"/);
  assert.match(productionMaterializer, /capability === "ai\.video\.inpaint"/);
  assert.match(creativeServiceResolver, /EDIT_IMAGE:\s*"ai\.image\.edit"/);
  assert.match(creativeServiceResolver, /INPAINT_IMAGE:\s*"ai\.image\.inpaint"/);
  assert.match(creativeServiceResolver, /OUTPAINT_IMAGE:\s*"ai\.image\.outpaint"/);
  assert.match(creativeServiceResolver, /VIDEO_TO_VIDEO:\s*"ai\.video\.video_to_video"/);
  assert.match(creativeServiceResolver, /EDIT_VIDEO:\s*"ai\.video\.edit"/);
  assert.match(creativeServiceResolver, /INPAINT_VIDEO:\s*"ai\.video\.inpaint"/);
});

test("Cinema inpainting remains modeled but not automatically production-routed", () => {
  assert.match(productionTaskRuntime, /"ai\.video\.inpaint"/);
  assert.doesNotMatch(ownedCertificationPolicy, /"ai\.video\.inpaint"/);
  assert.match(cinemaRegistration, /"ai\.video\.inpaint"/);
  assert.match(cinemaRegistration, /vace_inpainting: false/);
  assert.match(cinemaProvider, /AVANTIQO_VIDEO_LOCAL_CAPABILITY_NOT_IMPLEMENTED/);
});

test("owned local video transport never persists raw reasoning", () => {
  assert.match(ownedWorker, /raw_reasoning_persisted:\s*false/);
  assert.match(ownedWorker, /avantiqo_local_compute_jobs/);
  assert.doesNotMatch(ownedWorker, /reasoning_content|chain_of_thought|scratchpad/);
});
