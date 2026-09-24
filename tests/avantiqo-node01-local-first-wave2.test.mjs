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
const voiceSttLocal=read("lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceSttLocalQueueProvider.js");

test("ACE-Step full song generation is owned Node01 local-only",()=>{
  assert.match(audio,/AvantiqoMusicGenerationLocalQueueProvider/);
  assert.match(audioRegistration,/local_only_execution:true/);
  assert.match(audioRegistration,/modal_fallback_allowed:false/);
  assert.match(audioRegistration,/ACE-Step\/Ace-Step1\.5/);
  assert.match(worker,/ai\.music\.generate/);
  assert.match(worker,/RunMusicGenerationJob/);
  assert.doesNotMatch(audio,/Modal|modal|RunPod|SAFE_LEASE/);
});

test("document OCR classification and image analysis use local Qwen2.5-VL",()=>{
  assert.match(image,/\["ai\.image\.analyze", "document\.ocr", "document\.classify", "creative\.materials\.estimate"\]\.includes\(capability\)/);
  assert.match(image,/AvantiqoDocumentVisionLocalQueueProvider/);
  assert.match(imageRegistration,/qwen2\.5vl:3b/);
  assert.match(cert,/"qwen2\.5vl:3b"/);
  assert.match(cert,/quantization:\s*"Q4_K_M"/);
  assert.match(worker,/document\.ocr/);
  assert.match(worker,/RunDocumentVisionJob/);
});

test("normal code and code invention both stay on owned local Qwen",()=>{
  for(const capability of ["ai.code.generate","ai.code.invent","ai.code.edit","ai.code.refactor","ai.code.review","ai.code.debug","ai.code.test","ai.web.build","ai.web.repair","ai.app.build","ai.integration.build"]) {
    assert.match(codeLocal,new RegExp(capability.replaceAll(".","\\.")));
  }
  assert.match(code,/AvantiqoCodeLocalQueueProvider/);
  assert.match(api,/hard_code_invent:\s*"LOCAL_ONLY"/);
  assert.match(api,/normal_code:\s*"LOCAL_ONLY"/);
  assert.doesNotMatch(code,/Modal|modal|RunPod|SAFE_LEASE/);
});

test("wave2 routing advertises local-only specialist execution",()=>{
  assert.match(api,/music_generation:\s*"LOCAL_ONLY"/);
  assert.match(api,/document_ocr:\s*"LOCAL_ONLY"/);
  assert.match(api,/normal_code:\s*"LOCAL_ONLY"/);
  assert.match(api,/voice_tts:\s*"LOCAL_ONLY"/);
  assert.doesNotMatch(audio,/RUNPOD|SAFE_LEASE/);
  assert.doesNotMatch(code,/RUNPOD|SAFE_LEASE/);
});

test("local STT follows the optional kill-switch contract",()=>{
  assert.match(voiceSttLocal,/text\(process\.env\.AVANTIQO_LOCAL_VOICE_STT_ENABLED\) && !enabled/);
  assert.doesNotMatch(voiceSttLocal,/if \(!enabled\(process\.env\.AVANTIQO_LOCAL_VOICE_STT_ENABLED\)\) return false/);
});

test("document vision releases resident text model before loading Qwen VL",()=>{
  const start=worker.indexOf("function RunDocumentVisionJob");
  const end=worker.indexOf("function RunMediaJob", start);
  const block=worker.slice(start,end);
  assert.match(block,/UnloadOllamaModel/);
  assert.ok(block.indexOf("UnloadOllamaModel") < block.indexOf("local_runner.py") || block.indexOf("UnloadOllamaModel") < block.indexOf("WriteAllText"));
});

test("local worker treats empty stderr files as empty text",()=>{
  assert.match(worker,/function ReadTextFileOrEmpty/);
  assert.match(worker,/if \(\$null -eq \$raw\) \{ return '' \}/);
});
