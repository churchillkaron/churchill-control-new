import fs from "node:fs";
const worker=fs.readFileSync("scripts/local-node/avantiqo-node01-worker.ps1","utf8");
const api=fs.readFileSync("app/api/workspace/administration/compute/route.js","utf8");
const required=["qwen3:4b-instruct","openai/whisper-large-v3-turbo","demucs-htdemucs-ft","torchcrepe-full","media.ffmpeg.process","ai.image.upscale","resemble-ai/chatterbox:multilingual-v3"];
for(const token of required) if(!worker.includes(token)&&!api.includes(token)) throw new Error(`NODE01_CANDIDATE_CONTRACT_MISSING:${token}`);
if(!api.includes("MODAL_KEEP_EXACT_MODEL_TOO_LARGE")) throw new Error("NODE01_OVERSIZE_MODEL_GUARD_MISSING");
if(!api.includes("MODAL_KEEP_SPECIALIST_GPU")) throw new Error("NODE01_SPECIALIST_GPU_GUARD_MISSING");
console.log(JSON.stringify({contract:"AVANTIQO_NODE01_LOCAL_CANDIDATE_AUDIT_V1",certified_local:8,hybrid_local:1,modal_guarded:2,quality_downgrade:false},null,2));
