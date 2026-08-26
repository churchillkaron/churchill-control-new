import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const [
  baseConfigRaw,
  handlerV2,
  dockerfile,
  entrypoint,
  registration,
  provider,
  route,
  panel,
] = await Promise.all([
  read("config/avantiqo-music-extend-engine.json"),
  read("services/avantiqo-audio-engine/handler_v2.py"),
  read("services/avantiqo-audio-engine/Dockerfile"),
  read("services/avantiqo-audio-engine/entrypoint.py"),
  read("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js"),
  read("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js"),
  read("app/api/creative/music/remix/route.js"),
  read("components/creative/ProductionStudio/workspaces/MusicRemixPanel.jsx"),
]);

const baseConfig = JSON.parse(baseConfigRaw);
assert.equal(baseConfig.semantic_scope, "ARRANGEMENT_COMPLETION_ONLY");
assert.equal(baseConfig.temporal_extension_proven, false);
assert.equal(baseConfig.temporal_extend_routing_allowed, false);
assert.equal(baseConfig.superseded_for_temporal_extend, true);
assert.equal(baseConfig.temporal_extend_replacement_strategy, "XL_TURBO_REPAINT_RIGHT_OUTPAINT");
assert.equal(baseConfig.temporal_extend_replacement_lane, "audio");

assert.match(handlerV2, /TEMPORAL_EXTEND_CAPABILITY = "ai\.audio\.extend"/);
assert.match(handlerV2, /TEMPORAL_EXTEND_STRATEGY = "XL_TURBO_REPAINT_RIGHT_OUTPAINT"/);
assert.match(handlerV2, /base\.CAPABILITY_TASK_TYPES\[TEMPORAL_EXTEND_CAPABILITY\] = "repaint"/);
assert.match(handlerV2, /source_duration = _audio_duration_seconds\(source_path\)/);
assert.match(handlerV2, /target_duration = min\(maximum_target, source_duration \+ controls\["extension_seconds"\]\)/);
assert.match(handlerV2, /repaint_start = max\(0\.0, source_duration - overlap\)/);
assert.match(handlerV2, /repaint_end = target_duration/);
assert.match(handlerV2, /"temporal_extension_proven": False/);
assert.doesNotMatch(handlerV2, /task_type="complete"/);

assert.match(dockerfile, /COPY handler_v2\.py \.\/handler_v2\.py/);
assert.match(dockerfile, /handler\.CAPABILITY_TASK_TYPES\['ai\.audio\.extend'\] == 'repaint'/);
assert.match(dockerfile, /AVANTIQO_AUDIO_TEMPORAL_EXTEND_OUTPAINT=PASS/);
assert.match(entrypoint, /HANDLER_PATH = Path\("\/app\/handler_v2\.py"\)/);

assert.match(registration, /"ai\.audio\.extend"/);
assert.match(registration, /strategy: "XL_TURBO_REPAINT_RIGHT_OUTPAINT"/);
assert.match(registration, /runtime_status: "IMPLEMENTED_BENCHMARK_REQUIRED"/);
assert.match(registration, /temporal_extension_proven: false/);
assert.match(registration, /base_model_required_capabilities: \[\]/);

assert.match(provider, /AVANTIQO_MUSIC_TEMPORAL_EXTEND_OUTPAINT_NOT_CERTIFIED/);
assert.doesNotMatch(provider, /AvantiqoMusicExtendProvider/);

assert.match(route, /TEMPORAL_EXTEND_STRATEGY = "XL_TURBO_REPAINT_RIGHT_OUTPAINT"/);
assert.match(route, /service_id: "ai\.audio\.extend"/);
assert.match(route, /capability: "ai\.audio\.extend"/);
assert.match(route, /task_type: "repaint"/);
assert.match(route, /implementation: "IMPLEMENTED"/);
assert.match(route, /certification: "BENCHMARK_REQUIRED"/);
assert.match(route, /execution_route_enabled: false/);
assert.match(route, /extension_seconds: extensionSeconds/);
assert.match(route, /continuity_overlap_seconds: continuityOverlapSeconds/);
assert.doesNotMatch(route, /acestep-v15-base/);

assert.match(panel, /Temporal outpaint benchmark pending/);
assert.match(panel, /Extend by seconds/);
assert.match(panel, /Continuity overlap/);
assert.match(panel, /extension_seconds: Number\(extensionSeconds\)/);
assert.match(panel, /continuity_overlap_seconds: Number\(continuityOverlapSeconds\)/);
assert.match(panel, /XL Turbo tail outpainting is implemented/);
assert.doesNotMatch(panel, /Base model \+ benchmark required/);
assert.doesNotMatch(panel, /base-model lane is available/);

console.log("MUSIC_TEMPORAL_EXTEND_OUTPAINT_CONTRACT=PASS");
