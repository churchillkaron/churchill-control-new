import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../lib/creative/music/runtime/CreativeMusicMixEvidenceRuntime.js",import.meta.url),"utf8");

test("mix evidence batches spectral and temporal measurements into one FFmpeg process",()=>{
  assert.match(source,/AVANTIQO_MUSIC_MIX_EVIDENCE_V17/);
  assert.match(source,/asplit=\$\{bands\.length\+2\}/);
  for(const name of ["full","sub","lowmid","warmth","boxiness","presence","air","sibilance"]) assert.match(source,new RegExp(`volumedetect@\\$\\{name\\}`));
  assert.match(source,/aformat=channel_layouts=stereo,asplit=3\[fullst\]\[presencest\]\[lowst\]/);
  assert.match(source,/amerge=inputs=6/);
  assert.match(source,/analysis_process_count:1/);
  assert.match(source,/spectral_process_count:1/);
  assert.match(source,/envelope_process_count:1/);
  assert.match(source,/analysis_processes_per_measured_track:1/);
  assert.match(source,/envelope_processes_per_measured_track:1/);
  assert.match(source,/shared_decode_process:true/);
});

test("batched envelope graph preserves full, presence, and low evidence bands",()=>{
  assert.match(source,/channelsplit=channel_layout=stereo\[fullleft\]\[fullright\]/);
  assert.match(source,/highpass=f=2200,lowpass=f=5200,channelsplit=channel_layout=stereo/);
  assert.match(source,/highpass=f=30,lowpass=f=160,channelsplit=channel_layout=stereo/);
  assert.match(source,/dynamics_envelope:stereoEnvelopeRows\(channels\[0\],channels\[1\],sourceIsMono\)/);
  assert.match(source,/presence_envelope:stereoEnvelopeRows\(channels\[2\],channels\[3\],sourceIsMono\)/);
  assert.match(source,/low_envelope:stereoEnvelopeRows\(channels\[4\],channels\[5\],sourceIsMono\)/);
  assert.match(source,/TEMPORAL_SPECTRAL_COMPETITION/);
});


test("mix evidence covers the used song range instead of silently truncating at two minutes",()=>{
  assert.match(source,/MAX_ANALYSIS_SECONDS = 600/);
  assert.match(source,/analysisSecondsFor/);
  assert.match(source,/source_offset_seconds/);
  assert.match(source,/start_seconds/);
  assert.match(source,/analysis_seconds/);
  assert.match(source,/analysis_capped/);
  assert.doesNotMatch(source,/rows\.slice\(0,240\)/);
  assert.doesNotMatch(source,/WINDOW_SECONDS = 120/);
});


test("one-pass evidence measures deterministic stereo correlation and mono fold-down",()=>{
  assert.match(source,/channelsplit=channel_layout=stereo\[fullleft\]\[fullright\]/);
  assert.match(source,/stereoMetrics\(channels\[0\],channels\[1\],sourceIsMono\)/);
  assert.match(source,/stereo_correlation/);
  assert.match(source,/mono_fold_down_loss_db/);
  assert.match(source,/stereo_phase_risk/);
  assert.match(source,/phase_risk_track_count/);
});


test("temporal envelopes use stereo energy rather than destructive mono summing",()=>{
  assert.match(source,/stereoEnvelopeRows/);
  assert.match(source,/left\[i\]\*left\[i\]\+right\[i\]\*right\[i\]/);
  assert.match(source,/sourceIsMono\?Math\.SQRT2:1/);
  assert.doesNotMatch(source,/pan=mono/);
});


test("one-pass evidence also measures EBU-style loudness and true peak without another decode",()=>{
  assert.match(source,/loudnorm=I=-24:LRA=20:TP=-1:print_format=json/);
  assert.match(source,/function loudnessStats/);
  assert.match(source,/integrated_lufs/);
  assert.match(source,/true_peak_dbtp/);
  assert.match(source,/loudness_range_lu/);
  assert.match(source,/loudness_threshold_lufs/);
  assert.match(source,/analysis_process_count:1/);
});
