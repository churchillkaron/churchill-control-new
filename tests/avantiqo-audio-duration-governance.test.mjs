import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const guard = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioDurationGuard.js", import.meta.url),
  "utf8",
);
const provider = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", import.meta.url),
  "utf8",
);

test("Audio short-form duration guard is Avantiqo-owned and one-job only", () => {
  assert.match(guard, /AVANTIQO_AUDIO_DURATION_GUARD_V1/);
  assert.match(guard, /const guardSeconds = requested <= 15 \? 6 : 4/);
  assert.match(guard, /no early outro, fade-to-silence, dead air, or silent tail/);
  assert.match(guard, /automatic_retry_allowed: false/);
  assert.match(guard, /AVANTIQO_AUDIO_DURATION_GUARD_SILENT_TAIL_REJECTED/);
  assert.match(guard, /duration_guard_cpu_owned_by_avantiqo: true/);
  assert.match(guard, /duration_guard_extra_gpu_jobs: 0/);
  assert.match(provider, /prepareAudioDurationGuard\(input\)/);
  assert.match(provider, /encodeAudioDurationGuardJobId/);
  assert.match(provider, /finalizeAudioDurationGuard/);
});

test("Audio worker cannot grant customer-production activation", () => {
  assert.match(guard, /production_governance_authority: "AVANTIQO_SERVICE_RUNTIME"/);
  assert.match(guard, /worker_runtime_capability_certified/);
  assert.match(guard, /worker_runtime_activation_hint/);
  assert.match(guard, /production_certified: false/);
  assert.match(guard, /activation_allowed: false/);
});

test("Audio duration guard rewrites cropped WAV lengths before reparsing", () => {
  const dataSizeWrite = guard.indexOf("combined.writeUInt32LE(croppedDataBytes, wav.data.size_offset)");
  const riffSizeWrite = guard.indexOf("combined.writeUInt32LE(combined.length - 8, 4)");
  const reparse = guard.indexOf("const croppedWav = parseWav(combined)");
  assert.ok(dataSizeWrite >= 0 && riffSizeWrite >= 0 && reparse >= 0);
  assert.ok(dataSizeWrite < reparse);
  assert.ok(riffSizeWrite < reparse);
});
