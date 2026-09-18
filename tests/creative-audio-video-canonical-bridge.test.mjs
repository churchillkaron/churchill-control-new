import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const soundtrack = fs.readFileSync(
  "lib/creative/audio/runtime/CreativeMasterSoundtrackRuntime.js",
  "utf8",
);
const gate = fs.readFileSync(
  "lib/creative/audio/runtime/CreativeMasterSoundtrackRenderGate.js",
  "utf8",
);
const mux = fs.readFileSync(
  "lib/creative/post-production/runtime/CreativeProfessionalMasterAudioMuxRuntime.js",
  "utf8",
);
const finalMaster = fs.readFileSync(
  "lib/creative/release/runtime/CreativeFinalMasteringRuntime.js",
  "utf8",
);
const color = fs.readFileSync(
  "lib/creative/color/runtime/CreativeColorFinishingRuntime.js",
  "utf8",
);
const delivery = fs.readFileSync(
  "lib/creative/release/runtime/CreativeTemporalChannelDeliveryRuntime.js",
  "utf8",
);
const postProduction = fs.readFileSync(
  "lib/creative/post-production/runtime/CreativePostProductionRuntime.js",
  "utf8",
);

test("Video Studio requires a QC-sealed Audio Studio master", () => {
  assert.match(soundtrack, /MASTER_SOUNDTRACK_AUDIO_STUDIO_QC_SEAL_REQUIRED/);
  assert.match(soundtrack, /audio_master_qc_sealed === true/);
  assert.match(soundtrack, /audio_master_qc_seal_hash/);
  assert.match(soundtrack, /ProductionTaskRepository\.listByProject/);
});
test("canonical EDL render contains only the locked master soundtrack", () => {
  assert.match(gate, /audio:\s*\[track\]/);
  assert.match(gate, /include_source_audio:\s*false/);
  assert.match(gate, /audio_mix_normalize:\s*false/);
  assert.match(gate, /prohibit_source_clip_audio:\s*true/);
  assert.match(gate, /prohibit_provider_added_music:\s*true/);
});

test("visual finishing restores approved audio by stream copy and preserves seal identity", () => {
  assert.match(mux, /"-c:a",\s*"copy"/);
  assert.match(mux, /audio_studio_qc_sealed/);
  assert.match(mux, /audio_studio_qc_seal_hash/);
  assert.match(mux, /master_audio_stream_copy:\s*true/);
});

test("final mastering and derivatives preserve Audio Studio QC evidence", () => {
  assert.match(finalMaster, /audio_studio_qc_seal_preserved_when_applicable/);
  assert.match(finalMaster, /audio_studio_qc_seal_hash/);
  assert.match(delivery, /audio_studio_qc_sealed/);
  assert.match(delivery, /audio_studio_qc_seal_hash/);
  assert.match(delivery, /derivative_created_from_timeline_rerender/);
});

test("canonical post-production installs the soundtrack gate before professional finishing", () => {
  const soundtrackIndex = postProduction.indexOf("CreativeMasterSoundtrackRenderGate");
  const finishingIndex = postProduction.indexOf("CreativeProfessionalFinishingBootstrap");
  assert.ok(soundtrackIndex >= 0);
  assert.ok(finishingIndex > soundtrackIndex);
});

test("Color DI stream-copies audio, revalidates it, and preserves Audio Studio provenance", () => {
  assert.match(color, /"-c:a",\s*"copy"/);
  assert.match(color, /validateMasterAudioAfterColor/);
  assert.match(color, /audio_studio_qc_sealed/);
  assert.match(color, /audio_studio_qc_seal_hash/);
  assert.match(color, /master_soundtrack_integrity_passed_after_color_finishing/);
});

test("canonical post-production is isolated from legacy investor self-mix runtimes", () => {
  assert.doesNotMatch(postProduction, /AvantiqoInvestorFilm/);
  assert.doesNotMatch(postProduction, /AvantiqoInvestorOpeningAssemblyRuntime/);
});
