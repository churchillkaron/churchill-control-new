import process from "node:process";

const C="AVANTIQO_IMAGE_160GB_EUR_IS1_MIGRATION_V1";
const REST="https://rest.runpod.io/v1";
const QUEUE="https://api.runpod.ai/v2";
const ENDPOINT_ID="m9ieryijbnq77q";
const ENDPOINT_NAME="avantiqo-image-v1";
const SOURCE_VOLUME_ID="7pcdebhpga";
const SOURCE_VOLUME_NAME="avantiqo-shared-image-video-cache";
const SOURCE_DC="US-NC-2";
const SOURCE_SIZE=400;
const TARGET_DC="EUR-IS-1";
const TARGET_NAME="avantiqo-image-cache-eur-is-1";
const TARGET_SIZE=160;
const MODEL="Tongyi-MAI/Z-Image";
const CACHE="/runpod-volume/huggingface-cache/hub";
const REQUIRED=["model_index.json","scheduler/scheduler_config.json","text_encoder/config.json","text_encoder/generation_config.json","text_encoder/model.safetensors.index.json","text_encoder/model-00001-of-00003.safetensors","text_encoder/model-00002-of-00003.safetensors","text_encoder/model-00003-of-00003.safetensors","tokenizer/tokenizer_config.json","tokenizer/tokenizer.json","tokenizer/vocab.json","tokenizer/merges.txt","transformer/config.json","transformer/diffusion_pytorch_model.safetensors.index.json","transformer/diffusion_pytorch_model-00001-of-00002.safetensors","transformer/diffusion_pytorch_model-00002-of-00002.safetensors","vae/config.json","vae/diffusion_pytorch_model.safetensors"];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const text=v=>String(v??"").trim();
const list=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const rows=v=>Array.isArray(v)?v:list(v?.data||v?.items||v?.results||v?.pods||v?.endpoints||v?.volumes||v?.networkVolumes);
const approved=v=>["YES","TRUE","1","APPROVED"].includes(text(v).toUpperCase());

async function parse(r,label,allow404=false){const raw=await r.text();let b={};try{b=raw?JSON.parse(raw):{}}catch{b={message:raw}}if(allow404&&r.status===404)return{__not_found:true};if(!r.ok)throw new Error(`${label}_HTTP_${r.status}:${text(b?.message||b?.error||raw).slice(0,700)}`);return b}
async function rest(path,key,{method="GET",body,allow404=false,timeout=30000}={}){return parse(await fetch(`${REST}${path}`,{method,headers:{Authorization:`Bearer ${key}`,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout)}),`${C}_REST`,allow404)}
async function health(key){return parse(await fetch(`${QUEUE}/${ENDPOINT_ID}/health`,{headers:{Authorization:`Bearer ${key}`,Accept:"application/json"},signal:AbortSignal.timeout(30000)}),`${C}_QUEUE`)}
function vids(e={}){const out=[];if(text(e.networkVolumeId))out.push(text(e.networkVolumeId));for(const x of list(e.networkVolumeIds)){const id=typeof x==="string"?text(x):text(x?.networkVolumeId||x?.id);if(id)out.push(id)}return[...new Set(out)]}
function active(h={}){const j=h.jobs||{},w=h.workers||{};return{q:num(j.inQueue??j.in_queue),p:num(j.inProgress??j.in_progress),w:["idle","initializing","ready","running","throttled","unhealthy"].reduce((s,k)=>s+Math.max(0,num(w[k])),0)}}
function assertIdle(e,h,label){const a=active(h);if(text(e.id)!==ENDPOINT_ID||text(e.name)!==ENDPOINT_NAME)throw new Error(`${label}_IDENTITY`);if(num(e.workersMin,-1)!==0||num(e.workersMax,-1)!==0)throw new Error(`${label}_NOT_0_0`);if(a.q||a.p||a.w)throw new Error(`${label}_ACTIVE:${JSON.stringify(a)}`)}
function core(e={}){return{id:text(e.id),name:text(e.name),template:text(e.templateId||e.template?.id),workersMin:num(e.workersMin),workersMax:num(e.workersMax),idleTimeout:num(e.idleTimeout),scalerType:text(e.scalerType),scalerValue:num(e.scalerValue),computeType:text(e.computeType),gpuCount:num(e.gpuCount),gpuTypeIds:list(e.gpuTypeIds).map(text),flashboot:e.flashboot===true||e.flashBoot===true||text(e.flashBootType).toUpperCase()==="FLASHBOOT",allowedCudaVersions:list(e.allowedCudaVersions),minCudaVersion:text(e.minCudaVersion),executionTimeout:num(e.executionTimeoutMs??e.executionTimeout)}}
function placement(e={}){return{dataCenterIds:list(e.dataCenterIds).map(text),networkVolumeId:text(e.networkVolumeId),networkVolumeIds:vids(e)}}

function bootstrap(){return String.raw`
import http.server,json,pathlib,subprocess,sys,threading,time
MODEL=${JSON.stringify(MODEL)}
CACHE=pathlib.Path(${JSON.stringify(CACHE)})
REQ=${JSON.stringify(REQUIRED)}
READY=False
DETAIL={"phase":"boot"}
def run():
 global READY,DETAIL
 try:
  subprocess.check_call([sys.executable,"-m","pip","install","--no-cache-dir","huggingface_hub>=0.34,<1"])
  from huggingface_hub import snapshot_download
  started=time.time(); snap=pathlib.Path(snapshot_download(repo_id=MODEL,cache_dir=str(CACHE)))
  missing=[r for r in REQ if not (snap/r).is_file()]
  if missing: raise RuntimeError("missing:"+",".join(missing[:20]))
  marker=snap/".avantiqo-photoreal-cache-complete.json"
  marker.write_text(json.dumps({"contract":"AVANTIQO_IMAGE_PHOTOREAL_CACHE_COMPLETION_V1","target_model":MODEL,"snapshot_revision":snap.name,"snapshot_download_completed":True,"required_file_count":len(REQ)},separators=(",",":"),sort_keys=True),encoding="utf-8")
  files=[p for p in snap.rglob("*") if p.is_file()]
  DETAIL={"success":True,"model":MODEL,"snapshot_revision":snap.name,"missing_required_file_count":0,"required_file_count":len(REQ),"completion_marker_written":True,"file_count":len(files),"logical_bytes":sum(p.stat().st_size for p in files),"elapsed_seconds":round(time.time()-started,3),"inference_performed":False};READY=True
 except Exception as e: DETAIL={"success":False,"error_type":type(e).__name__,"error":str(e)[:700]}
threading.Thread(target=run,daemon=True).start()
class H(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  if self.path!="/health": self.send_response(404);self.end_headers();return
  b=json.dumps({"ready":READY,**DETAIL}).encode();self.send_response(200);self.send_header("Content-Type","application/json");self.send_header("Content-Length",str(len(b)));self.end_headers();self.wfile.write(b)
 def log_message(self,*a): return
http.server.ThreadingHTTPServer(("0.0.0.0",8000),H).serve_forever()
`}

async function deletePod(key,id){if(!id)return;const r=await fetch(`${REST}/pods/${encodeURIComponent(id)}`,{method:"DELETE",headers:{Authorization:`Bearer ${key}`,Accept:"application/json"},signal:AbortSignal.timeout(30000)});if(!r.ok&&r.status!==404)throw new Error(`${C}_POD_DELETE_${r.status}`);for(let i=0;i<40;i++){const p=await rest(`/pods/${encodeURIComponent(id)}?includeNetworkVolume=true`,key,{allow404:true}).catch(()=>({__not_found:true}));if(p.__not_found)return;const s=text(p.desiredStatus||p.status).toUpperCase();if(["EXITED","STOPPED","TERMINATED","DELETED"].includes(s))return;await sleep(3000)}throw new Error(`${C}_POD_DELETE_TIMEOUT`)}
async function deleteVolume(key,id){const r=await fetch(`${REST}/networkvolumes/${encodeURIComponent(id)}`,{method:"DELETE",headers:{Authorization:`Bearer ${key}`,Accept:"application/json"},signal:AbortSignal.timeout(30000)});if(!r.ok&&r.status!==404){const raw=await r.text();throw new Error(`${C}_VOLUME_DELETE_${r.status}:${raw.slice(0,400)}`)}}

if(!approved(process.env.AVANTIQO_IMAGE_160GB_EUR_IS1_MIGRATION_APPROVED))throw new Error("APPROVAL_REQUIRED");
const key=text(process.env.RUNPOD_MANAGEMENT_API_KEY||process.env.RUNPOD_API_KEY);const runtime=text(process.env.RUNPOD_API_KEY||key);if(!key||!runtime)throw new Error("RUNPOD_KEY_REQUIRED");
let podId=null,targetId=null,created=false,rebound=false,oldDeleted=false,originalPlacement=null,beforeCore=null;
try{
 const [before,bh,volRaw]=await Promise.all([rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`,key),health(runtime),rest("/networkvolumes",key)]);
 assertIdle(before,bh,`${C}_BEFORE`);beforeCore=core(before);originalPlacement=placement(before);if(JSON.stringify(vids(before))!==JSON.stringify([SOURCE_VOLUME_ID]))throw new Error(`${C}_SOURCE_BINDING_INVALID`);
 const volumes=rows(volRaw);const source=volumes.find(v=>text(v.id)===SOURCE_VOLUME_ID);if(!source||text(source.name)!==SOURCE_VOLUME_NAME||text(source.dataCenterId??source.data_center_id)!==SOURCE_DC||num(source.size??source.sizeGb,-1)!==SOURCE_SIZE)throw new Error(`${C}_SOURCE_INVALID`);
 const same=volumes.filter(v=>text(v.name)===TARGET_NAME);if(same.length>1)throw new Error(`${C}_TARGET_DUPLICATE`);if(same[0]&&(text(same[0].dataCenterId??same[0].data_center_id)!==TARGET_DC||num(same[0].size??same[0].sizeGb,-1)!==TARGET_SIZE))throw new Error(`${C}_TARGET_COLLISION`);
 let target=same[0]||null;if(!target){target=await rest("/networkvolumes",key,{method:"POST",body:{dataCenterId:TARGET_DC,name:TARGET_NAME,size:TARGET_SIZE},timeout:60000});created=true}targetId=text(target?.id||target?.data?.id);if(!targetId)throw new Error(`${C}_TARGET_ID_REQUIRED`);
 const tv=await rest(`/networkvolumes/${encodeURIComponent(targetId)}`,key);if(text(tv.name)!==TARGET_NAME||text(tv.dataCenterId??tv.data_center_id)!==TARGET_DC||num(tv.size??tv.sizeGb,-1)!==TARGET_SIZE)throw new Error(`${C}_TARGET_VERIFY_FAILED`);
 const b64=Buffer.from(bootstrap(),"utf8").toString("base64");const pod=await rest("/pods",key,{method:"POST",timeout:60000,body:{name:`avantiqo-image-cache-eur-${Date.now().toString(36)}`,imageName:"python:3.11-slim",cloudType:"SECURE",computeType:"CPU",cpuFlavorIds:["cpu3c"],cpuFlavorPriority:"custom",dataCenterIds:[TARGET_DC],dataCenterPriority:"custom",vcpuCount:2,containerDiskInGb:5,networkVolumeId:targetId,volumeMountPath:"/runpod-volume",globalNetworking:true,supportPublicIp:false,ports:["8000/http"],dockerEntrypoint:["python","-c"],dockerStartCmd:["import base64,os;exec(compile(base64.b64decode(os.environ['BOOT']),'x','exec'))"],env:{BOOT:b64,HF_HUB_DISABLE_XET:"1",HF_XET_RECONSTRUCT_WRITE_SEQUENTIALLY:"1",HF_XET_NUM_CONCURRENT_RANGE_GETS:"1",HF_HUB_DOWNLOAD_TIMEOUT:"600",HF_HUB_ETAG_TIMEOUT:"60"}}});podId=text(pod?.id||pod?.pod?.id||pod?.data?.id);if(!podId)throw new Error(`${C}_POD_ID_REQUIRED`);
 const base=`https://${podId}-8000.proxy.runpod.net`;let reachable=false;for(let i=0;i<120;i++){try{const r=await fetch(`${base}/health`,{signal:AbortSignal.timeout(15000)});if(r.ok){reachable=true;await r.arrayBuffer();break}}catch{}await sleep(5000)}if(!reachable)throw new Error(`${C}_POD_START_TIMEOUT`);
 let cache=null;for(let i=0;i<540;i++){try{const r=await fetch(`${base}/health`,{signal:AbortSignal.timeout(15000)});if(r.ok){cache=await r.json();if(cache.ready===true&&cache.success===true)break;if(cache.success===false)throw new Error(`${C}_CACHE_FAIL:${text(cache.error_type)}:${text(cache.error)}`)}}catch(e){if(text(e?.message).startsWith(`${C}_CACHE_FAIL`))throw e}await sleep(5000)}if(!cache||cache.ready!==true||cache.success!==true||text(cache.model)!==MODEL||num(cache.missing_required_file_count,-1)!==0||cache.completion_marker_written!==true||num(cache.required_file_count,0)!==REQUIRED.length)throw new Error(`${C}_CACHE_INVALID`);
 await deletePod(key,podId);podId=null;
 const [pre,ph]=await Promise.all([rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`,key),health(runtime)]);assertIdle(pre,ph,`${C}_PREWRITE`);if(JSON.stringify(core(pre))!==JSON.stringify(beforeCore)||JSON.stringify(placement(pre))!==JSON.stringify(originalPlacement))throw new Error(`${C}_CONCURRENT_CHANGE`);
 await rest(`/endpoints/${ENDPOINT_ID}`,key,{method:"PATCH",body:{dataCenterIds:[TARGET_DC],networkVolumeId:targetId,networkVolumeIds:[targetId]}});await sleep(1500);
 const [after,ah]=await Promise.all([rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`,key),health(runtime)]);assertIdle(after,ah,`${C}_AFTER`);if(JSON.stringify(core(after))!==JSON.stringify(beforeCore))throw new Error(`${C}_UNRELATED_FIELD_CHANGED`);if(JSON.stringify(vids(after))!==JSON.stringify([targetId]))throw new Error(`${C}_TARGET_BINDING_FAILED`);rebound=true;
 const [epsRaw,podsRaw]=await Promise.all([rest("/endpoints?includeWorkers=true",key),rest("/pods?includeNetworkVolume=true",key)]);const consumers=rows(epsRaw).filter(e=>vids(e).includes(SOURCE_VOLUME_ID));const attachments=rows(podsRaw).filter(p=>text(p?.networkVolume?.id||p?.networkVolumeId)===SOURCE_VOLUME_ID);if(consumers.length||attachments.length)throw new Error(`${C}_SOURCE_STILL_USED:${consumers.map(e=>text(e.name)).join(",")}:${attachments.map(p=>text(p.id)).join(",")}`);
 await deleteVolume(key,SOURCE_VOLUME_ID);const gone=await rest(`/networkvolumes/${SOURCE_VOLUME_ID}`,key,{allow404:true});if(!gone.__not_found)throw new Error(`${C}_SOURCE_DELETE_NOT_VERIFIED`);oldDeleted=true;
 console.log(JSON.stringify({success:true,contract:C,target_volume:{id:targetId,name:TARGET_NAME,size_gb:TARGET_SIZE,data_center_id:TARGET_DC},source_volume_deleted:{id:SOURCE_VOLUME_ID,name:SOURCE_VOLUME_NAME,size_gb:SOURCE_SIZE},persistent_storage_reduction_gb:SOURCE_SIZE-TARGET_SIZE,cached_model:MODEL,cache_required_files_verified:REQUIRED.length,cpu_seed_pod_deleted:true,workers_min:0,workers_max:0,gpu_compute_used:false,inference_performed:false,wallet_mutation_performed:false,production_deploy_performed:false,video_resources_mutated:false,secrets_printed:false},null,2));
}catch(error){if(podId)await deletePod(key,podId).catch(()=>null);if(rebound&&!oldDeleted&&originalPlacement){try{await rest(`/endpoints/${ENDPOINT_ID}`,key,{method:"PATCH",body:originalPlacement});await sleep(1200)}catch{}}
 if(created&&targetId&&!oldDeleted){try{const [e,p]=await Promise.all([rest("/endpoints?includeWorkers=true",key),rest("/pods?includeNetworkVolume=true",key)]);if(!rows(e).some(x=>vids(x).includes(targetId))&&!rows(p).some(x=>text(x?.networkVolume?.id||x?.networkVolumeId)===targetId))await deleteVolume(key,targetId)}catch{}}
 throw error}
