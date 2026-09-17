import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../lib/creative/music/runtime/CreativeMusicMixEvidenceRuntime.js",import.meta.url),"utf8");

test("mix evidence batches spectral and temporal measurements into two FFmpeg processes",()=>{
  assert.match(source,/AVANTIQO_MUSIC_MIX_EVIDENCE_V8/);
  assert.match(source,/asplit=\$\{bands\.length\}/);
  for(const name of ["full","sub","lowmid","warmth","boxiness","presence","air","sibilance"]) assert.match(source,new RegExp(`volumedetect@\\$\\{name\\}`));
  assert.match(source,/asplit=3\[full\]\[presencein\]\[lowin\]/);
  assert.match(source,/amerge=inputs=3/);
  assert.match(source,/analysis_process_count:2/);
  assert.match(source,/spectral_process_count:1/);
  assert.match(source,/envelope_process_count:1/);
  assert.match(source,/analysis_processes_per_measured_track:2/);
  assert.match(source,/envelope_processes_per_measured_track:1/);
});

test("batched envelope graph preserves full, presence, and low evidence bands",()=>{
  assert.match(source,/\[full\]anull\[fullout\]/);
  assert.match(source,/highpass=f=2200,lowpass=f=5200\[presenceout\]/);
  assert.match(source,/highpass=f=30,lowpass=f=160\[lowout\]/);
  assert.match(source,/dynamics_envelope:envelopeRows\(channels\[0\]\)/);
  assert.match(source,/presence_envelope:envelopeRows\(channels\[1\]\)/);
  assert.match(source,/low_envelope:envelopeRows\(channels\[2\]\)/);
  assert.match(source,/TEMPORAL_SPECTRAL_COMPETITION/);
});
