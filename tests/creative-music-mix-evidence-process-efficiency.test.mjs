import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../lib/creative/music/runtime/CreativeMusicMixEvidenceRuntime.js",import.meta.url),"utf8");

test("mix evidence batches eight spectral measurements into one FFmpeg graph",()=>{
  assert.match(source,/AVANTIQO_MUSIC_MIX_EVIDENCE_V7/);
  assert.match(source,/asplit=\$\{bands\.length\}/);
  for(const name of ["full","sub","lowmid","warmth","boxiness","presence","air","sibilance"]) assert.match(source,new RegExp(`volumedetect@\\$\\{name\\}`));
  assert.match(source,/analysis_process_count:4/);
  assert.match(source,/spectral_process_count:1/);
  assert.match(source,/analysis_processes_per_measured_track:4/);
  assert.match(source,/spectral_processes_per_measured_track:1/);
});

test("time envelopes remain separate to preserve current evidence semantics",()=>{
  assert.match(source,/pcmEnvelope\(ffmpeg,media\.file_path\)/);
  assert.match(source,/highpass=f=2200,lowpass=f=5200/);
  assert.match(source,/highpass=f=30,lowpass=f=160/);
  assert.match(source,/TEMPORAL_SPECTRAL_COMPETITION/);
});
