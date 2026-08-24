import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`missing:${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

function requirePattern(source, pattern, label) {
  if (!pattern.test(source)) failures.push(label);
}

function forbidPattern(source, pattern, label) {
  if (pattern.test(source)) failures.push(label);
}

const route = read("app/api/creative/music/studio/route.js");
const workspace = read("components/creative/ProductionStudio/workspaces/MusicWorkspace.jsx");
const engine = read("lib/creative/runtime/engines/MusicEngine.js");
const finishing = read("lib/creative/music/runtime/CreativeMusicFinishingRuntime.js");
const worker = read("services/avantiqo-audio-engine/handler.py");
const registration = read("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js");
const router = read("components/creative/ProductionStudio/layout/WorkspaceCanvasRouter.jsx");
const registry = read("lib/creative/registry/applyCreativeWorkspaceRegistry.js");
const benchmark = read("scripts/benchmark-avantiqo-music.mjs");
const economics = read("scripts/avantiqo-music-economics.mjs");
const reviewPrep = read("scripts/prepare-avantiqo-music-human-review.mjs");
const reviewFinalizer = read("scripts/finalize-avantiqo-music-human-review.mjs");
const promotionPlan = read("scripts/plan-avantiqo-music-promotion.mjs");

requirePattern(route, /UsageRuntime\.get\(usageId\)/, "music-status-must-resolve-governed-usage-server-side");
requirePattern(route, /CreativeMusicFinishingRuntime\.ensureMaster/, "music-route-must-trigger-automatic-mastering");
requirePattern(route, /action === "history"/, "music-route-must-expose-version-history");
requirePattern(route, /provider_selection_exposed:\s*false/, "music-route-must-hide-provider-selection");
forbidPattern(route, /const provider = text\(body\.provider\)/, "music-route-must-not-trust-client-provider");
forbidPattern(route, /pricing:\s*body\.pricing/, "music-route-must-not-trust-client-pricing");

requirePattern(workspace, /action:\s*"status"[\s\S]*usage_id:\s*session\.usage_id/, "music-workspace-must-poll-by-usage-id");
forbidPattern(workspace, /provider_job_id:\s*session\./, "music-workspace-must-not-send-provider-job-id");
forbidPattern(workspace, /pricing:\s*session\.pricing/, "music-workspace-must-not-send-pricing");
requirePattern(workspace, /Version history/, "music-workspace-must-show-version-history");
requirePattern(workspace, /Automatic studio finishing/, "music-workspace-must-show-automatic-finishing");
requirePattern(workspace, /resolutionFailures/, "music-private-playback-must-be-retry-bounded");

requirePattern(finishing, /music_asset_kind:\s*SOURCE_KIND/, "music-source-assets-must-be-versioned");
requirePattern(finishing, /music_asset_kind:\s*MASTER_KIND/, "music-master-assets-must-be-separate");
requirePattern(finishing, /dispatchAudioTask\(finishTask\)/, "music-mastering-must-use-canonical-audio-finisher");
requirePattern(finishing, /target_lufs/, "music-mastering-must-carry-loudness-target");
requirePattern(finishing, /true_peak_dbtp/, "music-mastering-must-carry-true-peak-target");
requirePattern(finishing, /release-wav/, "music-mastering-must-deliver-wav");
requirePattern(finishing, /release-mp3/, "music-mastering-must-deliver-mp3");
requirePattern(finishing, /waveform/, "music-mastering-must-produce-waveform-evidence");
requirePattern(finishing, /musicStorageReference/, "music-persistence-must-resolve-nested-storage-reference");

requirePattern(engine, /ai\.music\.generate/, "music-engine-must-own-generation-contract");
requirePattern(engine, /ai\.audio\.remix/, "music-engine-must-model-remix-contract");
requirePattern(engine, /ai\.audio\.edit/, "music-engine-must-model-edit-contract");
requirePattern(engine, /acestep-v15-base/, "music-engine-must-declare-base-model-lane");
requirePattern(engine, /BASE_MODEL_AND_BENCHMARK_REQUIRED/, "base-model-features-must-stay-gated");

requirePattern(worker, /"ai\.audio\.remix":\s*"cover"/, "owned-audio-worker-must-map-remix-to-cover");
requirePattern(worker, /"ai\.audio\.edit":\s*"repaint"/, "owned-audio-worker-must-map-edit-to-repaint");
requirePattern(worker, /DEFAULT_CERTIFIED_CAPABILITIES\s*=\s*\{"ai\.music\.generate"\}/, "owned-audio-worker-default-certification-must-remain-generation-only");
requirePattern(worker, /AVANTIQO_AUDIO_CAPABILITY_NOT_CERTIFIED/, "owned-audio-worker-must-fail-closed-on-uncertified-capability");
requirePattern(worker, /MAX_SOURCE_BYTES/, "owned-audio-worker-must-bound-source-downloads");
requirePattern(worker, /allow_redirects=False/, "owned-audio-worker-source-download-must-not-follow-redirects");

requirePattern(registration, /DEFAULT_CERTIFIED_CAPABILITIES = Object\.freeze\(\["ai\.music\.generate"\]\)/, "audio-provider-default-certification-must-remain-generation-only");
requirePattern(registration, /"ai\.audio\.remix"/, "audio-provider-must-register-implemented-remix-contract");
requirePattern(registration, /"ai\.audio\.edit"/, "audio-provider-must-register-implemented-edit-contract");
requirePattern(registration, /base_model_required_capabilities/, "audio-provider-must-declare-base-model-required-capabilities");

requirePattern(benchmark, /AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED/, "music-benchmark-must-require-explicit-spend-approval");
requirePattern(benchmark, /AVANTIQO_MUSIC_CERTIFICATION_BENCHMARK_V3/, "music-benchmark-must-use-current-evidence-contract");
requirePattern(benchmark, /runpod_execution_ms/, "music-benchmark-must-capture-runpod-billed-execution-time");
requirePattern(benchmark, /organization_record_created:\s*false/, "music-benchmark-must-not-create-business-organization-records");
requirePattern(benchmark, /MUST_BE_SYNTHETIC/, "music-benchmark-must-reject-real-organization-scope");
requirePattern(benchmark, /activation_allowed:\s*false/, "music-benchmark-must-not-activate-production-routing");

requirePattern(economics, /AVANTIQO_MUSIC_ECONOMICS_V1/, "music-economics-contract-required");
requirePattern(economics, /AVANTIQO_AUDIO_GPU_USD_PER_HOUR_REQUIRED/, "music-economics-must-require-real-gpu-rate");
requirePattern(economics, /runpod_execution_ms/, "music-economics-must-use-runpod-billed-execution-time");
requirePattern(economics, /utilization_adjusted_compute_usd_per_audio_second/, "music-economics-must-measure-unit-cost");
requirePattern(economics, /human_audio_quality_certified:\s*false/, "music-economics-must-keep-human-quality-gate-open");
requirePattern(economics, /pricing_activation_performed:\s*false/, "music-economics-must-not-activate-pricing");
requirePattern(economics, /activation_allowed:\s*false/, "music-economics-must-remain-measurement-only");

requirePattern(reviewPrep, /AVANTIQO_MUSIC_HUMAN_REVIEW_V1/, "music-human-review-contract-required");
requirePattern(reviewPrep, /automatic_human_approval_forbidden:\s*true/, "music-human-review-must-forbid-automatic-approval");
requirePattern(reviewPrep, /instrumental_integrity/, "music-human-review-must-check-unintended-vocals");
requirePattern(reviewPrep, /commercial_release_readiness/, "music-human-review-must-check-release-readiness");
requirePattern(reviewPrep, /review_status:\s*"PENDING"/, "music-human-review-must-start-pending");

requirePattern(reviewFinalizer, /AVANTIQO_OWNED_MEDIA_CERTIFICATION_EVIDENCE_V1/, "music-human-review-must-produce-shared-media-evidence-contract");
requirePattern(reviewFinalizer, /REVIEWER_REQUIRED/, "music-human-review-finalization-must-require-reviewer");
requirePattern(reviewFinalizer, /score_0_100/, "music-human-review-finalization-must-validate-scores");
requirePattern(reviewFinalizer, /production_certified:\s*false/, "music-human-review-must-not-self-certify-production");
requirePattern(reviewFinalizer, /activation_allowed:\s*false/, "music-human-review-must-not-activate-routing");

requirePattern(promotionPlan, /AVANTIQO_MUSIC_PROMOTION_PLAN_V1/, "music-promotion-plan-contract-required");
requirePattern(promotionPlan, /human_quality_certified/, "music-promotion-plan-must-require-human-quality");
requirePattern(promotionPlan, /human_quality_reviewer/, "music-promotion-plan-must-bind-reviewer");
requirePattern(promotionPlan, /certified_capability:\s*CAPABILITY/, "music-promotion-plan-must-bind-capability");
requirePattern(promotionPlan, /certified_model:\s*MODEL/, "music-promotion-plan-must-bind-model");
requirePattern(promotionPlan, /automatic_activation_forbidden:\s*true/, "music-promotion-plan-must-forbid-automatic-activation");
requirePattern(promotionPlan, /pricing_mutation_performed:\s*false/, "music-promotion-plan-must-not-mutate-pricing");
requirePattern(promotionPlan, /ready_for_explicit_promotion:\s*false/, "music-promotion-plan-must-require-explicit-promotion-step");

requirePattern(router, /music:\s*MusicWorkspace/, "creative-router-must-route-music-workspace");
requirePattern(registry, /id:\s*"music"/, "creative-registry-must-own-music-workspace");

if (failures.length) {
  console.error("MUSIC_STUDIO_RELEASE_AUDIT=FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("MUSIC_STUDIO_RELEASE_AUDIT=PASS");
console.log("MUSIC_GENERATION_CONTRACT=OWNED");
console.log("MUSIC_ASSET_PERSISTENCE=DURABLE");
console.log("MUSIC_AUTOMATIC_MASTERING=REQUIRED");
console.log("MUSIC_VERSION_HISTORY=REQUIRED");
console.log("MUSIC_CLIENT_PROVIDER_SELECTION=HIDDEN");
console.log("MUSIC_BENCHMARK=SPEND_GUARDED_AND_SYNTHETIC_SCOPE_ONLY");
console.log("MUSIC_ECONOMICS=MEASUREMENT_REQUIRED_BEFORE_PRICING_PROMOTION");
console.log("MUSIC_HUMAN_QUALITY=EXPLICIT_LISTENING_REVIEW_REQUIRED");
console.log("MUSIC_PROMOTION=PLAN_ONLY_EXPLICIT_ACTIVATION_REQUIRED");
console.log("MUSIC_REMIX_EDIT=IMPLEMENTED_BENCHMARK_GATED");
console.log("MUSIC_EXTEND_STEMS=BASE_MODEL_GATED");
