import { createHash } from "node:crypto";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_SAFETENSORS_PREFETCH_REPAIR_V1";
const APPROVAL = "AVANTIQO_INTELLIGENCE_FAST_SAFETENSORS_PREFETCH_REPAIR_APPROVED";
const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];
const object = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const finite = (v, d = null) => Number.isFinite(Number(v)) ? Number(v) : d;
const key = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const runtimeKey = text(process.env.RUNPOD_API_KEY) || key;
if (!key) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
if (text(process.env[APPROVAL]).toUpperCase() !== "YES") throw new Error(`${APPROVAL}=YES_REQUIRED`);

async function request(url, credential, options = {}) {
  const r = await fetch(url, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${credential}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30000),
  });
  const raw = await r.text();
  let body = null; try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!r.ok || body === null) throw new Error(`${CONTRACT}_HTTP_${r.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0,500)}`);
  return body;
}
const rest = (p, o={}) => request(`${REST_BASE}${p}`, key, o);
const health = (id) => request(`${QUEUE_BASE}/${encodeURIComponent(id)}/health`, runtimeKey, { timeoutMs: 20000 });
function rows(v, keys=[]) { if (Array.isArray(v)) return v; if (!v || typeof v !== "object") return []; for (const k of [...keys,"data","items","results"]) if (Array.isArray(v[k])) return v[k]; return []; }
function envMap(v) { const pairs = Array.isArray(v) ? v.map(e => [text(e?.key||e?.name), String(e?.value??"")]) : Object.entries(object(v)).map(([k,x])=>[k,String(x??"")]); return Object.fromEntries(pairs.filter(([k])=>k)); }
function tmplRuntime(t={}) { return { imageName:text(t.imageName), category:text(t.category)||"NVIDIA", containerDiskInGb:finite(t.containerDiskInGb,150), dockerEntrypoint:Array.isArray(t.dockerEntrypoint)?t.dockerEntrypoint:[], dockerStartCmd:Array.isArray(t.dockerStartCmd)?t.dockerStartCmd:[], env:envMap(t.env), isPublic:t.isPublic===true, isServerless:true, ports:list(t.ports), readme:text(t.readme)||"Avantiqo Fast Intelligence", ...(t.volumeInGb==null?{}:{volumeInGb:finite(t.volumeInGb)}), ...(text(t.volumeMountPath)?{volumeMountPath:text(t.volumeMountPath)}:{}), ...(text(t.containerRegistryAuthId)?{containerRegistryAuthId:text(t.containerRegistryAuthId)}:{}) }; }
function endpointInvariant(e={}) { return { id:text(e.id), name:text(e.name), gpuCount:finite(e.gpuCount), gpuTypeIds:list(e.gpuTypeIds).map(text).sort(), dataCenterIds:list(e.dataCenterIds).map(text).sort(), allowedCudaVersions:list(e.allowedCudaVersions).map(text).sort(), minCudaVersion:text(e.minCudaVersion)||null, networkVolumeId:text(e.networkVolumeId)||null, networkVolumeIds:list(e.networkVolumeIds).map(text).sort(), workersMin:finite(e.workersMin), workersMax:finite(e.workersMax), executionTimeoutMs:finite(e.executionTimeoutMs), idleTimeout:finite(e.idleTimeout), scalerType:text(e.scalerType), scalerValue:finite(e.scalerValue), flashboot:e.flashboot===true } }
function activeWorkers(e={}) { return list(e.workers).filter(w => !["EXITED","STOPPED","TERMINATED","DELETED"].includes(text(w?.desiredStatus||w?.status).toUpperCase())); }
function queueSafe(h={}) { const j=object(h.jobs), w=object(h.workers); return finite(j.inQueue??j.in_queue,0)===0 && finite(j.inProgress??j.in_progress,0)===0 && ["idle","initializing","ready","running","throttled","unhealthy"].every(k=>finite(w[k],0)===0); }

const [epsRaw, tmplsRaw] = await Promise.all([rest("/endpoints?includeTemplate=true&includeWorkers=true"), rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false")]);
const eps = rows(epsRaw,["endpoints","serverlessEndpoints"]); const matches=eps.filter(e=>text(e.name)===FAST_NAME); if(matches.length!==1) throw new Error(`${CONTRACT}_FAST_RESOLUTION_${matches.length}`); const fast=matches[0];
const fastId=text(fast.id); const h=await health(fastId); if(finite(fast.workersMin,-1)!==0 || finite(fast.workersMax,-1)!==0 || activeWorkers(fast).length || !queueSafe(h)) throw new Error(`${CONTRACT}_FAST_NOT_PARKED_0_0`);
const templateId=text(fast.templateId||fast.template?.id); const templates=rows(tmplsRaw,["templates"]); const source=templates.find(t=>text(t.id)===templateId)||fast.template; if(!source) throw new Error(`${CONTRACT}_SOURCE_TEMPLATE_MISSING`);
const sourceRuntime=tmplRuntime(source); const serialized=JSON.stringify(sourceRuntime); if(!serialized.includes(FAST_MODEL)) throw new Error(`${CONTRACT}_FAST_MODEL_BINDING_MISSING`);
if(text(sourceRuntime.env.SAFETENSORS_LOAD_STRATEGY).toLowerCase()==="prefetch") { console.log(JSON.stringify({success:true,contract:CONTRACT,action:"NOOP_ALREADY_REPAIRED",endpoint:FAST_NAME,template_id:templateId,workers_min:0,workers_max:0,new_network_volume_created:false,production_deploy_performed:false},null,2)); process.exit(0); }
const candidateRuntime={...sourceRuntime,env:{...sourceRuntime.env,SAFETENSORS_LOAD_STRATEGY:"prefetch"}};
const fingerprint=createHash("sha256").update(JSON.stringify(candidateRuntime)).digest("hex").slice(0,12); const candidateName=`avantiqo-intelligence-fast-prefetch-${fingerprint}`; const candidateBody={...candidateRuntime,name:candidateName};
let target=templates.find(t=>text(t.name)===candidateName)||null; let templateCreated=false;
if(!target){ target=await rest("/templates",{method:"POST",body:candidateBody}); templateCreated=true; }
const targetId=text(target.id); if(!targetId) throw new Error(`${CONTRACT}_TARGET_TEMPLATE_ID_MISSING`);
const before=endpointInvariant(fast);
await rest(`/endpoints/${encodeURIComponent(fastId)}`,{method:"PATCH",body:{templateId:targetId}});
const verified=await rest(`/endpoints/${encodeURIComponent(fastId)}?includeTemplate=true&includeWorkers=true`); const vh=await health(fastId);
if(text(verified.templateId||verified.template?.id)!==targetId) throw new Error(`${CONTRACT}_REBIND_NOT_PERSISTED`);
const after=endpointInvariant(verified); if(JSON.stringify(before)!==JSON.stringify(after)) throw new Error(`${CONTRACT}_ENDPOINT_TOPOLOGY_DRIFT`);
if(!queueSafe(vh)||activeWorkers(verified).length) throw new Error(`${CONTRACT}_POST_REPAIR_NOT_IDLE`);
const actualEnv=envMap(verified?.template?.env || target?.env); if(text(actualEnv.SAFETENSORS_LOAD_STRATEGY).toLowerCase()!=="prefetch") throw new Error(`${CONTRACT}_PREFETCH_NOT_VISIBLE`);
console.log(JSON.stringify({success:true,contract:CONTRACT,action:"FAST_TEMPLATE_PREFETCH_REPAIRED",previous_template_id:templateId,target_template_id:targetId,target_template_name:candidateName,template_created:templateCreated,safetensors_load_strategy:"prefetch",endpoint_topology_preserved:true,gpu_priority:after.gpuTypeIds,data_centers_unrestricted:after.dataCenterIds.length===0,network_volume_attached:Boolean(after.networkVolumeId||after.networkVolumeIds.length),workers_min:after.workersMin,workers_max:after.workersMax,new_network_volume_created:false,model_inference_performed:false,production_deploy_performed:false},null,2));
console.log(`${CONTRACT}=PASS`);
