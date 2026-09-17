import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mix = readFileSync("lib/creative/music/runtime/CreativeMusicProfessionalMixRuntime.js", "utf8");
const continuation = readFileSync("lib/creative/music/runtime/CreativeMusicProfessionalContinuationRuntime.js", "utf8");

test("professional mix preparation requires workstation offline render", () => {
  assert.match(mix, /buildMusicReleaseRenderPlan/);
  assert.match(mix, /status:"WORKSTATION_RENDER_REQUIRED"/);
  assert.match(mix, /workstation_render_required:true/);
  assert.match(mix, /browser_preview_is_not_release_master:true/);
  assert.match(mix, /required_actions:\["prepare_upload","register"\]/);
});

test("professional mix render acceptance rejects stale or falsely mastered premaster", () => {
  assert.match(mix, /CREATIVE_MUSIC_PRO_MIX_RENDER_STALE/);
  assert.match(mix, /full_mix_processing_applied!==true/);
  assert.match(mix, /release_limiter_applied!==false/);
  assert.match(mix, /professional_mix_passed:true/);
  assert.match(mix, /professional_premaster_qc_passed:false/);
});

test("premaster QC is a separate stage and blocks clipping or invalid format", () => {
  assert.match(mix, /CREATIVE_MUSIC_PRO_PREMASTER_ACCEPTED_MIX_REQUIRED/);
  assert.match(mix, /no_clipping:mixAsset\.metadata\?\.clipping!==true/);
  assert.match(mix, /sample_rate_valid/);
  assert.match(mix, /stereo:/);
  assert.match(mix, /mastering_allowed:passed/);
});

test("continuation keeps mix and premaster QC as separate exact stages", () => {
  assert.match(continuation, /next\.stage_id==="MIX_ENGINEERING"/);
  assert.match(continuation, /acceptProfessionalMixRender/);
  assert.match(continuation, /next\.stage_id==="PREMASTER_QC"/);
  assert.match(continuation, /certifyProfessionalPremaster/);
});
