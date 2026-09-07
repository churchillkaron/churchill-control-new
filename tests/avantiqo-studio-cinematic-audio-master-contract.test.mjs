import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const runtime = read("lib/creative/audio/runtime/CreativeCinematicAudioMasterRuntime.js");
const queue = read("lib/creative/audio/runtime/AudioQueueRuntime.js");
const finishing = read("lib/creative/audio/runtime/CreativeAudioFinishingRuntime.js");
const contract = read("lib/creative/audio/runtime/AudioFinishingContractRuntime.js");
const temporal = read("lib/creative/audio/runtime/CreativeTemporalSoundtrackCueSheetRuntime.js");
const master = read("lib/creative/audio/runtime/CreativeMasterSoundtrackRuntime.js");

assert.match(runtime, /AVANTIQO_CINEMATIC_AUDIO_MASTER_V1/);
assert.match(runtime, /AVANTIQO_CINEMATIC_AUDIO_MASTER_REPORT_V1/);
assert.match(runtime, /AVANTIQO_CINEMATIC_AUDIO_MASTER_QC_V1/);
assert.match(runtime, /AVANTIQO_CINEMATIC_AUDIO_MASTER_QC_SEAL_V1/);
assert.match(runtime, /ITU_R_BS_1770_5_EBU_R128/);
assert.match(runtime, /provider_neutral:\s*true/);
assert.match(runtime, /promptless:\s*true/);
assert.match(runtime, /surround_and_object_audio_not_claimed:\s*true/);
assert.match(runtime, /stereo_and_mono_mastering_only:\s*true/);

for (const bus of ["DIALOGUE", "MUSIC", "EFFECTS", "AMBIENCE", "PROGRAM"]) {
  assert.match(runtime, new RegExp(`${bus}:\\s*"${bus}"`));
}

assert.match(runtime, /sidechaincompress=/);
assert.match(runtime, /dialogue_ducking_applied/);
assert.match(runtime, /dialogue_priority/);
assert.match(runtime, /music_present/);
assert.match(runtime, /dialogue_present/);
assert.match(runtime, /amix=inputs=/);
assert.match(runtime, /aresample=/);
assert.match(runtime, /pcm_f32le/);
assert.match(runtime, /pcm_s24le/);

assert.match(runtime, /loudnorm=I=/);
assert.match(runtime, /measured_I=/);
assert.match(runtime, /measured_TP=/);
assert.match(runtime, /measured_LRA=/);
assert.match(runtime, /measured_thresh=/);
assert.match(runtime, /offset=/);
assert.match(runtime, /linear=true/);
assert.match(runtime, /two_pass_loudnorm_required:\s*true/);
assert.match(runtime, /true_peak_verification_required:\s*true/);
assert.match(runtime, /actual_rendered_audio_is_authority:\s*true/);
assert.match(runtime, /aggregate_score_cannot_override_hard_audio_failure:\s*true/);
assert.match(runtime, /semantic_dialogue_intelligibility_review_required:\s*true/);

for (const check of [
  "integrated_loudness",
  "true_peak",
  "sample_rate",
  "channel_count",
  "duration",
  "two_pass_loudness_measurement",
  "dialogue_priority",
]) {
  assert.match(runtime, new RegExp(check));
}

assert.match(runtime, /audio_master_qc_sealed:\s*true/);
assert.match(runtime, /audio_master_qc_seal_hash/);
assert.match(runtime, /qc_seal:\s*qcSeal/);
assert.match(runtime, /no_provider_calls_added:\s*true/);
assert.match(runtime, /surround_or_object_audio_claimed:\s*false/);
assert.match(runtime, /waveform\.png/);
assert.match(runtime, /master-report\.json/);
assert.match(runtime, /master\.wav/);
assert.match(runtime, /review\.mp3/);

assert.match(queue, /CreativeCinematicAudioMasterRuntime/);
assert.match(queue, /CreativeCinematicAudioMasterRuntime\.finish\(task\)/);
assert.match(queue, /cinematic_audio_mastering_required:\s*true/);
assert.match(queue, /CREATIVE_AUDIO_MASTER_QC_SEAL_REQUIRED/);
assert.match(queue, /audio_master_qc_seal_verified:\s*true/);
assert.match(queue, /music ducking under speech/);
assert.match(queue, /hard-QC seal is necessary but not sufficient/);

assert.match(finishing, /AUDIO_LOUDNESS_TARGET_MISSED/);
assert.match(finishing, /AUDIO_TRUE_PEAK_EXCEEDED/);
assert.match(contract, /CREATIVE_AUDIO_TARGET_LUFS_REQUIRED/);
assert.match(contract, /CREATIVE_AUDIO_TRUE_PEAK_DBTP_REQUIRED/);
assert.match(temporal, /dialogue_and_narration_take_priority_when_present:\s*true/);
assert.match(temporal, /ambience_and_effects_must_be_authored_into_master:\s*true/);
assert.match(master, /MASTER_SOUNDTRACK_HUMAN_APPROVAL_REQUIRED/);
assert.match(master, /allow_automatic_normalization:\s*false/);
assert.match(master, /allow_provider_added_music:\s*false/);

console.log("AVANTIQO_STUDIO_CINEMATIC_AUDIO_MASTER_CONTRACT=PASS");
