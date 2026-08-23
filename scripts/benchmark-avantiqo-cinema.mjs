import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const API_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1";
const SUBMIT_TIMEOUT_MS = 30000;
const STATUS_TIMEOUT_MS = 30000;
const POLL_INTERVAL_MS = 5000;
const MAX_JOB_WAIT_MS = Math.max(
  POLL_INTERVAL_MS,
  Number(process.env.AVANTIQO_RUNPOD_BENCHMARK_TIMEOUT_MS || 20 * 60 * 1000),
);

function text(value) { return String(value ?? "").trim(); }
function required(name) { const value=text(process.env[name]); if(!value) throw new Error(`${name}_REQUIRED`); return value; }
function percentile(values,fraction){const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!sorted.length)return null;return sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*fraction))];}
function sleep(ms){return new Promise((resolvePromise)=>setTimeout(resolvePromise,ms));}
function terminalFailure(status){return ["FAILED","TIMED_OUT","CANCELLED","CANCELED"].includes(status);}
function errorDetail(body={}){const value=body?.error??body?.message??body?.output?.error;if(value&&typeof value==="object")return JSON.stringify(value).slice(0,1000);return text(value).slice(0,1000);}
async function parseJsonResponse(response){const raw=await response.text();let body={};try{body=raw?JSON.parse(raw):{};}catch{body={};}if(!response.ok)throw new Error(`RUNPOD_HTTP_${response.status}:${errorDetail(body)||text(raw).slice(0,1000)}`);return body;}
async function runQueued(endpointId,input,apiKey){const started=performance.now();const submitResponse=await fetch(`${API_BASE}/${endpointId}/run`,{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({input}),signal:AbortSignal.timeout(SUBMIT_TIMEOUT_MS)});let body=await parseJsonResponse(submitResponse);let status=text(body?.status).toUpperCase();const jobId=text(body?.id);if(status==="COMPLETED")return{body,wallMs:Math.round(performance.now()-started),jobId:jobId||null};if(!jobId)throw new Error(`RUNPOD_ASYNC_SUBMIT_JOB_ID_MISSING:${status||"UNKNOWN"}`);if(terminalFailure(status))throw new Error(`RUNPOD_JOB_${status}:${errorDetail(body)}`);const deadline=Date.now()+MAX_JOB_WAIT_MS;while(Date.now()<deadline){await sleep(POLL_INTERVAL_MS);const statusResponse=await fetch(`${API_BASE}/${endpointId}/status/${encodeURIComponent(jobId)}`,{method:"GET",headers:{Authorization:`Bearer ${apiKey}`,Accept:"application/json"},signal:AbortSignal.timeout(STATUS_TIMEOUT_MS)});body=await parseJsonResponse(statusResponse);status=text(body?.status).toUpperCase();if(status==="COMPLETED")return{body,wallMs:Math.round(performance.now()-started),jobId};if(terminalFailure(status))throw new Error(`RUNPOD_JOB_${status}:${errorDetail(body)}`);}throw new Error(`RUNPOD_JOB_WAIT_TIMEOUT:${jobId}:${MAX_JOB_WAIT_MS}`);}

const apiKey=text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY)||required("RUNPOD_API_KEY");
const endpointId=required("RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID");
const t2vModel=text(process.env.AVANTIQO_VIDEO_T2V_MODEL)||"Wan-AI/Wan2.2-T2V-A14B-Diffusers";
const i2vModel=text(process.env.AVANTIQO_VIDEO_I2V_MODEL)||"Wan-AI/Wan2.2-I2V-A14B-Diffusers";
const t2vUpload=required("AVANTIQO_CINEMA_BENCHMARK_T2V_UPLOAD_URL");
const t2vReference=required("AVANTIQO_CINEMA_BENCHMARK_T2V_STORAGE_REFERENCE");
const i2vUpload=required("AVANTIQO_CINEMA_BENCHMARK_I2V_UPLOAD_URL");
const i2vReference=required("AVANTIQO_CINEMA_BENCHMARK_I2V_STORAGE_REFERENCE");
const sourceImage=required("AVANTIQO_CINEMA_BENCHMARK_I2V_SOURCE_URL");
const observations=[];

for(const sample of [
  {mode:"t2v",capability:"ai.video.generate",foundationModel:t2vModel,upload:t2vUpload,storageReference:t2vReference,references:[],instruction:"Cinematic slow dolly through a refined dark architectural space, soft volumetric light, physically realistic materials, subtle motion, no text, no logo."},
  {mode:"i2v",capability:"ai.video.image_to_video",foundationModel:i2vModel,upload:i2vUpload,storageReference:i2vReference,references:[sourceImage],instruction:"Preserve the reference composition and identity. Add a subtle cinematic camera push, natural parallax and physically plausible light movement. No redesign, no text."},
]){
  const {body,wallMs,jobId}=await runQueued(endpointId,{contract:CONTRACT,capability:sample.capability,foundation_model:sample.foundationModel,organization_id:"benchmark-only",organization_service_id:"benchmark-only",usage_id:`benchmark-cinema-${sample.mode}`,instruction:sample.instruction,duration_seconds:2,fps:16,aspect_ratio:"16:9",resolution:"720p",seed:62001,quality_profile:"cinema",reference_images:sample.references,storage_upload:{signed_url:sample.upload,storage_reference:sample.storageReference}},apiKey);
  const output=body.output||{};
  observations.push({mode:sample.mode,capability:sample.capability,runpod_job_id:jobId,wall_ms:wallMs,worker_generation_seconds:Number(output.generation_seconds)||null,foundation_model:text(output.foundation_model),duration_seconds:Number(output.duration_seconds)||null,fps:Number(output.fps)||null,frame_count:Number(output.frame_count)||null,width:Number(output.width)||null,height:Number(output.height)||null,size_bytes:Number(output.size_bytes)||null,passed:text(output.capability)===sample.capability&&text(output.foundation_model)===sample.foundationModel&&Number(output.width)===1280&&Number(output.height)===704&&Number(output.size_bytes)>10000&&Number(output.frame_count)>=17&&output.raw_reasoning_persisted===false});
}
const wall=observations.map((item)=>item.wall_ms);
const report={contract:"AVANTIQO_CINEMA_CERTIFICATION_BENCHMARK_V1",generated_at:new Date().toISOString(),activation_allowed:false,purpose:"MEASURE_ONLY_DO_NOT_ACTIVATE_PRICING",models:{t2v:t2vModel,i2v:i2vModel},runpod_wait_policy:{submission_mode:"ASYNC_RUN_STATUS_POLLING",submit_timeout_ms:SUBMIT_TIMEOUT_MS,status_timeout_ms:STATUS_TIMEOUT_MS,poll_interval_ms:POLL_INTERVAL_MS,max_job_wait_ms:MAX_JOB_WAIT_MS},summary:{runs:observations.length,passed:observations.length===2&&observations.every((item)=>item.passed),t2v_passed:Boolean(observations.find((item)=>item.mode==="t2v")?.passed),i2v_passed:Boolean(observations.find((item)=>item.mode==="i2v")?.passed),p50_wall_ms:percentile(wall,0.5),p95_wall_ms:percentile(wall,0.95)},observations,certification_requirements:{human_visual_quality_review_required:true,identity_preservation_review_required:true,measured_gpu_economics_required:true,production_pricing_status_required:"PRODUCTION_CERTIFIED",video_to_video_certified:false,video_edit_certified:false,lipsync_certified:false}};
const outputPath=resolve(process.env.AVANTIQO_CINEMA_BENCHMARK_OUTPUT||"/tmp/avantiqo-cinema-certification-benchmark.json");
await writeFile(outputPath,`${JSON.stringify(report,null,2)}\n`,"utf8");
console.log(JSON.stringify({success:true,output_path:outputPath,summary:report.summary,activation_allowed:false},null,2));
