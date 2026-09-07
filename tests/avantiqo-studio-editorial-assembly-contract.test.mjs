import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const planner = read(
  "lib/creative/post-production/runtime/CreativeEditorialAssemblyRuntime.js",
);
const renderer = read(
  "lib/creative/post-production/runtime/CreativeEditorialAssemblyRenderRuntime.js",
);
const bootstrap = read(
  "lib/creative/post-production/runtime/CreativeEditorialAssemblyRenderBootstrap.js",
);
const instrumentation = read("instrumentation.js");

assert.match(planner, /AVANTIQO_EDITORIAL_ASSEMBLY_V1/);
assert.match(planner, /AVANTIQO_EDITORIAL_TRANSITION_V1/);
assert.match(planner, /AVANTIQO_EDITORIAL_SOURCE_GATE_V1/);
assert.match(planner, /AVANTIQO_CONTINUITY_QC_GATE_V1/);
assert.match(planner, /AVANTIQO_CONTINUITY_QC_SEAL_V1/);

for (const type of [
  "CUT",
  "MATCH_CUT",
  "SMASH_CUT",
  "CROSS_DISSOLVE",
  "DIP_TO_BLACK",
  "J_CUT",
  "L_CUT",
  "AUDIO_CROSSFADE",
]) {
  assert.match(planner, new RegExp(type));
}

assert.match(planner, /decorative_transition_invention_forbidden:\s*true/);
assert.match(planner, /generative_morph_transition_forbidden:\s*true/);
assert.match(planner, /transition_duration_bounded_by_clip_length:\s*true/);
assert.match(planner, /source_audio_split_edits_use_real_media_handles:\s*true/);
assert.match(planner, /EDITORIAL_J_CUT_PREROLL_HANDLE_REQUIRED/);
assert.match(planner, /EDITORIAL_L_CUT_TAIL_HANDLE_REQUIRED/);
assert.match(planner, /EDITORIAL_AUDIO_CROSSFADE_PREROLL_HANDLE_REQUIRED/);
assert.match(planner, /EDITORIAL_TRANSITION_AUTHORITY_CONFLICT/);
assert.match(planner, /EDITORIAL_TRANSITION_MOTIVATION_REQUIRED/);
assert.match(planner, /EDITORIAL_GENERATED_SOURCE_CONTINUITY_QC_SEAL_REQUIRED/);

assert.match(renderer, /AVANTIQO_EDITORIAL_ASSEMBLY_RENDER_V1/);
assert.match(renderer, /xfade=transition=/);
assert.match(renderer, /fadeblack/);
assert.match(renderer, /afade=t=in/);
assert.match(renderer, /afade=t=out/);
assert.match(renderer, /adelay=/);
assert.match(renderer, /CreativeEditorialAssemblyRuntime\.mapTimelineTime/);
assert.match(renderer, /expected_duration_seconds:\s*assembly\.output_duration_seconds/);
assert.match(renderer, /source_audio_split_edits_rendered:\s*true/);
assert.match(renderer, /EDITORIAL_SUBTITLE_RETIME_REQUIRED_BEFORE_TRANSITION_RENDER/);
assert.match(renderer, /governed_editorial_assembly_render/);

assert.match(bootstrap, /AVANTIQO_EDITORIAL_ASSEMBLY_RENDER_BOOTSTRAP_V1/);
assert.match(bootstrap, /CreativeEdlRenderRuntime\.render = async function renderWithEditorialAssembly/);
assert.match(bootstrap, /assemblyRenderDepth/);
assert.match(bootstrap, /fail_closed:\s*true/);
assert.match(bootstrap, /legacy_hard_cut_fast_path_preserved:\s*true/);

const assemblyIndex = instrumentation.indexOf(
  "CreativeEditorialAssemblyRenderBootstrap",
);
const finishingIndex = instrumentation.indexOf(
  "CreativeProfessionalFinishingBootstrap",
);
assert.ok(assemblyIndex >= 0);
assert.ok(finishingIndex > assemblyIndex);

console.log("AVANTIQO_STUDIO_EDITORIAL_ASSEMBLY_CONTRACT=PASS");
