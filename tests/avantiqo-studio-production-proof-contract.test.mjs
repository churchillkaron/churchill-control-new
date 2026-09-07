import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

const derivative = read("lib/creative/release/runtime/CreativeCertifiedMasterDerivativeRuntime.js");
const preflight = read("lib/creative/release/runtime/CreativeFfmpegDeliveryPreflightRuntime.js");
const film = read("lib/creative/certification/runtime/CreativeEndToEndFilmCertificationRuntime.js");
const recovery = read("lib/creative/quality/runtime/CreativeAutonomousRecoveryOrchestratorRuntime.js");
const recoveryBootstrap = read("lib/creative/quality/runtime/CreativeAutonomousRecoveryBootstrap.js");
const missionControl = read("components/creative/ProductionStudio/status/CreativeMissionControlPanel.jsx");
const productionWorkspace = read("components/creative/ProductionStudio/workspaces/ProductionWorkspaceV2.jsx");
const benchmark = read("lib/creative/certification/runtime/CreativeWorldClassBenchmarkRuntime.js");
const productionLearning = read("lib/creative/learning/runtime/CreativeProductionLearningRuntime.js");
const studioLearning = read("lib/creative/learning/runtime/CreativeStudioLearningRuntime.js");
const readiness = read("lib/creative/certification/runtime/CreativeStudioProductionReadinessRuntime.js");
const route = read("app/api/creative/production-certification/route.js");
const instrumentation = read("instrumentation.js");

test("certified derivatives originate from exact sealed master bytes", () => {
  assert.match(derivative, /AVANTIQO_CERTIFIED_MASTER_DERIVATIVE_V1/);
  assert.match(derivative, /exact_master_bytes_required:\s*true/);
  assert.match(derivative, /timeline_rerender_allowed:\s*false/);
  assert.match(derivative, /CERTIFIED_MASTER_BYTE_CHECKSUM_MISMATCH/);
  assert.match(derivative, /derivative_output_checksum/);
  assert.match(derivative, /CreativeFfmpegDeliveryPreflightRuntime\.assert/);
  assert.match(preflight, /AVANTIQO_FFMPEG_DELIVERY_PREFLIGHT_V1/);
  assert.match(preflight, /encoder_preflight_required:\s*true/);
  assert.match(preflight, /muxer_preflight_required:\s*true/);
});

test("real film certification remains evidence based and does not authorize publication", () => {
  assert.match(film, /AVANTIQO_END_TO_END_FILM_CERTIFICATION_V1/);
  assert.match(film, /AVANTIQO_INVESTOR_FILM_FIRST_MINUTE_CERTIFICATION_V1/);
  assert.match(film, /manual_intermediate_fixes_allowed:\s*false/);
  assert.match(film, /delivery_uses_exact_certified_master_bytes/);
  assert.match(film, /certification_does_not_authorize_publication:\s*true/);
});

test("autonomous recovery is governed and activated", () => {
  assert.match(recovery, /AVANTIQO_AUTONOMOUS_RECOVERY_V1/);
  for (const action of ["REUSE", "SURGICAL_REPAIR", "REGENERATE", "REROUTE", "BLOCK"]) {
    assert.match(recovery, new RegExp(`"${action}"`));
  }
  assert.match(recovery, /quality_floor_may_be_lowered:\s*false/);
  assert.match(recovery, /governance_may_be_bypassed:\s*false/);
  assert.match(recoveryBootstrap, /blind_retry_forbidden:\s*true/);
  assert.match(instrumentation, /CreativeAutonomousRecoveryBootstrap/);
});

test("mission control exposes production truth without provider or prompt controls", () => {
  assert.match(missionControl, /Autonomous Mission Control/);
  assert.match(missionControl, /Provider controls and prompts are intentionally absent/);
  assert.match(missionControl, /Winners/);
  assert.match(missionControl, /Rejected/);
  assert.match(missionControl, /Repairs/);
  assert.match(missionControl, /Approvals/);
  assert.match(missionControl, /Cost/);
  assert.match(missionControl, /ETA/);
  assert.match(productionWorkspace, /CreativeMissionControlPanel/);
});

test("world class benchmark spans hard filmmaking disciplines at immutable floor", () => {
  assert.match(benchmark, /AVANTIQO_STUDIO_WORLD_CLASS_BENCHMARK_V1/);
  assert.match(benchmark, /const FLOOR = 94/);
  for (const benchmarkCase of [
    "REALISTIC_HUMANS",
    "PERFORMANCE_DIALOGUE",
    "CAMERA_AERIAL",
    "ENVIRONMENT_WORLD",
    "VFX_PHYSICS",
    "BRAND_PRODUCT_FIDELITY",
    "EMOTIONAL_STORY",
    "MOTION_GRAPHICS_TEXT",
    "COLOR_FINISHING",
    "SOUND_MASTERING",
    "MULTI_VERSION_DELIVERY",
    "AUTONOMOUS_RECOVERY",
  ]) {
    assert.match(benchmark, new RegExp(benchmarkCase));
  }
  assert.match(benchmark, /benchmark_does_not_lower_quality_floor:\s*true/);
  assert.match(benchmark, /benchmark_does_not_authorize_publication:\s*true/);
});

test("production learning is advisory and cannot mutate governance", () => {
  assert.match(productionLearning, /AVANTIQO_CREATIVE_PRODUCTION_LEARNING_V1/);
  assert.match(productionLearning, /evidence_is_advisory:\s*true/);
  assert.match(productionLearning, /quality_floor_immutable:\s*true/);
  assert.match(productionLearning, /provider_routing_override_allowed:\s*false/);
  assert.match(productionLearning, /autonomous_governance_mutation_allowed:\s*false/);
  assert.match(studioLearning, /CREATIVE_STUDIO_LEARNING_V2/);
  assert.match(studioLearning, /production_learning/);
});

test("production readiness remains fail closed and never deploys implicitly", () => {
  assert.match(readiness, /AVANTIQO_STUDIO_PRODUCTION_READINESS_V1/);
  assert.match(readiness, /real_end_to_end_film_certified/);
  assert.match(readiness, /world_class_benchmark_passed/);
  assert.match(readiness, /wallet_and_cost_settlement_clear/);
  assert.match(readiness, /organization_isolation/);
  assert.match(readiness, /studio_load_certification/);
  assert.match(readiness, /studio_failure_recovery_certification/);
  assert.match(readiness, /production_deployment_authorized:\s*false/);
  assert.match(readiness, /explicit_deployment_approval_still_required:\s*true/);
  assert.match(route, /CreativeStudioProductionReadinessRuntime/);
  assert.match(route, /production_deployment_authorized:\s*false/);
});
