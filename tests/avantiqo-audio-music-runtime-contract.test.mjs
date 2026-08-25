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

test("owned audio registration keeps generation certified while advanced transforms stay gated", () => {
  assert.match(
    registration,
    /DEFAULT_CERTIFIED_CAPABILITIES = Object\.freeze\(\["ai\.music\.generate"\]\)/,
  );
  assert.match(registration, /"ai\.audio\.remix"/);
  assert.match(registration, /"ai\.audio\.edit"/);
  assert.match(registration, /modelVariant === "acestep-v15-xl-turbo"/);
  assert.match(registration, /lmModel === "acestep-5Hz-lm-1\.7B"/);
  assert.match(registration, /lmBackend === "vllm"/);
  assert.match(registration, /ace_step_lm_enabled: true/);
  assert.match(registration, /thinking_enabled: true/);
});

test("ACE-Step owned music model requires the XL plus 1.7B LM quality profile", () => {
  const model = AVANTIQO_OWNED_MODEL_CATALOG["avantiqo-audio"].models["ACE-Step/Ace-Step1.5"];
  assert.equal(model.license, "mit");
  assert.equal(model.runtime_compatible, true);
  assert.deepEqual(model.capabilities, ["ai.music.generate"]);
  assert.equal(model.runtime_variant, "acestep-v15-xl-turbo");
  assert.equal(model.quality_profile, "ACE_STEP_1_5_XL_TURBO_1_7B_LM_V1");
  assert.equal(model.ace_step_lm_enabled, true);
  assert.equal(model.ace_step_lm_model, "acestep-5Hz-lm-1.7B");
  assert.equal(model.ace_step_lm_backend, "vllm");
  assert.equal(model.thinking_enabled, true);
});

test("music worker uses ACE-Step LM reasoning internally without persisting raw reasoning", () => {
  assert.match(worker, /INIT_LLM = os\.getenv\("ACESTEP_INIT_LLM", "true"\)/);
  assert.match(worker, /SUPPORTED_MODEL_VARIANTS = \{"acestep-v15-xl-turbo"\}/);
  assert.match(worker, /SUPPORTED_LM_MODELS = \{"acestep-5Hz-lm-1\.7B"\}/);
  assert.match(worker, /thinking=use_lm/);
  assert.match(worker, /use_cot_metas=use_lm/);
  assert.match(worker, /use_cot_caption=use_lm/);
  assert.match(worker, /use_cot_lyrics=use_lm/);
  assert.match(worker, /use_cot_language=use_lm/);
  assert.match(worker, /"ace_step_lm_used": use_lm/);
  assert.match(worker, /"thinking_enabled": use_lm/);
  assert.match(worker, /"raw_reasoning_persisted": False/);
  assert.match(worker, /DEFAULT_CERTIFIED_CAPABILITIES = \{"ai\.music\.generate"\}/);
});
