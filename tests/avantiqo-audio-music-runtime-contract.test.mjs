import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  AVANTIQO_OWNED_MODEL_CATALOG,
} from "../lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js";

const registration = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js", import.meta.url),
  "utf8",
);
const worker = fs.readFileSync(
  new URL("../services/avantiqo-audio-engine/handler.py", import.meta.url),
  "utf8",
);

test("owned audio registration implements music only", () => {
  assert.match(registration, /IMPLEMENTED_CAPABILITIES = Object\.freeze\(\["ai\.music\.generate"\]\)/);
  assert.doesNotMatch(registration, /IMPLEMENTED_CAPABILITIES[\s\S]*ai\.sfx\.generate/);
  assert.match(registration, /ace_step_lm_enabled: false/);
});

test("ACE-Step model is approved only for music generation", () => {
  const model = AVANTIQO_OWNED_MODEL_CATALOG["avantiqo-audio"].models["ACE-Step/Ace-Step1.5"];
  assert.equal(model.license, "mit");
  assert.equal(model.runtime_compatible, true);
  assert.deepEqual(model.capabilities, ["ai.music.generate"]);
  assert.equal(model.ace_step_lm_enabled, false);
});

test("music worker disables ACE-Step hidden reasoning", () => {
  assert.match(worker, /thinking=False/);
  assert.match(worker, /use_cot_metas=False/);
  assert.match(worker, /use_cot_caption=False/);
  assert.match(worker, /use_cot_lyrics=False/);
  assert.match(worker, /use_cot_language=False/);
  assert.match(worker, /"raw_reasoning_persisted": False/);
  assert.match(worker, /CERTIFIED_CAPABILITIES = \{"ai\.music\.generate"\}/);
});
