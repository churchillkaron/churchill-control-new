import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Legacy filename retained for repository mission-safety. The architecture is now local-only.
const provider = fs.readFileSync(new URL("../lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", import.meta.url), "utf8");
const registration = fs.readFileSync(new URL("../lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js", import.meta.url), "utf8");

test("legacy Audio transport contract enforces local-only execution", () => {
  assert.match(provider, /local_only: true/);
  assert.match(registration, /infrastructure_candidates: \["AVANTIQO_LOCAL_NODE_V1"\]/);
  assert.match(registration, /cloud_fallback_allowed: false/);
  assert.doesNotMatch(provider, /createAvantiqoOwnedModalWorker|import\("modal"\)|MODAL_|RUNPOD|fal-ai/i);
  assert.doesNotMatch(registration, /MODAL_|modalConfigured|modal_fallback/i);
});
