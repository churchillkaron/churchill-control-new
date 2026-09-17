import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
function read(path){ return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8"); }
const worker=read("scripts/local-node/avantiqo-node01-worker.ps1");
const audio=read("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js");
const audioRegistration=read("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js");
const image=read("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProvider.js");
const imageRegistration=read("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProviderRegistration.js");
const code=read("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProviderV2.js");
const codeLocal=read("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js");
const api=read("app/api/workspace/administration/compute/route.js");
const cert=read("lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js");

test("ACE-Step full song generation is Node 01 CPU float32 first",()=>{
  assert.match(audio,/AvantiqoMusicGenerationLocalQueueProvider/);
  assert.match(audio,/AVANTIQO_MUSIC_GENERATION_LOCAL_FALLBACK_MODAL/);
  assert.match(audioRegistration,/CPU_FLOAT32/);
  assert.match(audioRegistration,/use_lm:\s*false/);
  assert.match(audioRegistration,/proven_full_song_seconds:\s*210/);
  assert.match(worker,/ai\.music\.generate/);
  assert.match(worker,/RunMusicGenerationJob/);
  assert.match(worker,/ACE_STEP_CPU_FLOAT32/);
});

test("document OCR and classification use local Qwen2.5-VL 3B first without downgrading general creative vision",()=>{
  assert.match(image,/AvantiqoDocumentVisionLocalQueueProvider/);
  assert.match(image,/capability === "document\.ocr" \|\| capability === "document\.classify"/);
  assert.doesNotMatch(image,/capability === "ai\.image\.analyze" \|\| capability === "document\.ocr" \|\| capability === "document\.classify"\) \{[\s\S]*AvantiqoDocumentVisionLocalQueueProvider/);
  assert.match(imageRegistration,/qwen2\.5vl:3b/);
  assert.match(cert,/"qwen2\.5vl:3b"/);
  assert.match(cert,/quantization:\s*"Q4_K_M"/);
  assert.match(worker,/document\.ocr/);
  assert.match(worker,/RunDocumentVisionJob/);
});

test("normal code is local Qwen 4B first while invention remains Modal H100",()=>{
  for(const capability of ["ai.code.generate","ai.code.edit","ai.code.refactor","ai.code.review","ai.code.debug","ai.code.test","ai.web.build","ai.web.repair","ai.app.build","ai.integration.build"]) assert.match(codeLocal,new RegExp(capability.replaceAll(".","\\.")));
  assert.doesNotMatch(codeLocal,/ai\.code\.invent/);
  assert.match(code,/AvantiqoCodeLocalQueueProvider/);
  assert.match(code,/AVANTIQO_CODE_LOCAL_FALLBACK_MODAL/);
  assert.match(api,/hard_code_invent:\s*"MODAL_H100"/);
  assert.match(api,/normal_code:\s*"LOCAL_GPU_QWEN4B_FIRST_MODAL_FALLBACK"/);
  assert.match(worker,/ai\.web\.build/); assert.match(worker,/ai\.app\.build/); assert.match(worker,/ai\.integration\.build/);
});

test("wave2 local-first routing keeps specialist generation on Modal",()=>{
  assert.match(api,/music_generation:\s*"LOCAL_CPU_ACE_STEP_FLOAT32_FIRST_MODAL_FALLBACK"/);
  assert.match(api,/document_ocr:\s*"LOCAL_GPU_QWEN25VL_3B_FIRST_MODAL_FALLBACK"/);
  assert.match(api,/MODAL_KEEP_SPECIALIST_GPU/);
  assert.doesNotMatch(audio,/RUNPOD|SAFE_LEASE/);
  assert.doesNotMatch(code,/RUNPOD|SAFE_LEASE/);
});
