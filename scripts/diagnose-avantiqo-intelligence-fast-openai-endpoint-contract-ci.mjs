const REST_BASE = "https://rest.runpod.io/v1";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_OPENAI_ENDPOINT_CONTRACT_V1";
const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];
const object = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const key = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!key) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
async function get(path){const r=await fetch(`${REST_BASE}${path}`,{headers:{Authorization:`Bearer ${key}`,Accept:"application/json"},signal:AbortSignal.timeout(30000)});const raw=await r.text();let b=null;try{b=raw?JSON.parse(raw):null}catch{}if(!r.ok||b===null)throw new Error(`${CONTRACT}_HTTP_${r.status}`);return b;}
function rows(v,ks=[]){if(Array.isArray(v))return v;if(!v||typeof v!=="object")return[];for(const k of [...ks,"data","items","results"])if(Array.isArray(v[k]))return v[k];return[];}
function one(items,name){const m=rows(items,["endpoints","serverlessEndpoints"]).filter(x=>text(x?.name)===name);if(m.length!==1)throw new Error(`${CONTRACT}_ENDPOINT_${name}_${m.length}`);return m[0];}
const safeKeyPattern=/(type|mode|openai|load|balanc|handler|worker|compute|scaler|flash|queue|category|version|endpoint|template|gpu|cuda|idle|execution|timeout|port|serverless|network|model)/i;
const deny=/(key|token|secret|password|authorization|env|credential|registryauth)/i;
function safeScalarMap(obj){const out={};for(const [k,v] of Object.entries(object(obj)).sort(([a],[b])=>a.localeCompare(b))){if(deny.test(k)||!safeKeyPattern.test(k))continue;if(v===null||["string","number","boolean"].includes(typeof v))out[k]=v;else if(Array.isArray(v)&&v.every(x=>["string","number","boolean"].includes(typeof x)))out[k]=v;}return out;}
function templateSummary(t={}){return {id:text(t.id)||null,name:text(t.name)||null,imageName:text(t.imageName)||null,category:text(t.category)||null,isServerless:t.isServerless===true,isPublic:t.isPublic===true,containerDiskInGb:t.containerDiskInGb??null,ports:list(t.ports),dockerEntrypointPresent:list(t.dockerEntrypoint).length>0,dockerStartCmdPresent:list(t.dockerStartCmd).length>0,topLevel:safeScalarMap(t)};}
function endpointSummary(e={}){return {id:text(e.id),name:text(e.name),templateId:text(e.templateId||e.template?.id)||null,workersMin:e.workersMin??null,workersMax:e.workersMax??null,gpuTypeIds:list(e.gpuTypeIds),dataCenterIds:list(e.dataCenterIds),networkVolumeId:text(e.networkVolumeId)||null,networkVolumeIds:list(e.networkVolumeIds),topLevel:safeScalarMap(e)};}
function diff(a,b){const keys=[...new Set([...Object.keys(a),...Object.keys(b)])].sort();return keys.filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])).map(k=>({key:k,deep:a[k]??null,fast:b[k]??null}));}
const [epsRaw,tmplsRaw]=await Promise.all([get("/endpoints?includeTemplate=true&includeWorkers=true"),get("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false")]);
const deep=one(epsRaw,DEEP_NAME),fast=one(epsRaw,FAST_NAME);const tmpls=rows(tmplsRaw,["templates"]);const dt=tmpls.find(t=>text(t.id)===text(deep.templateId||deep.template?.id))||deep.template||{};const ft=tmpls.find(t=>text(t.id)===text(fast.templateId||fast.template?.id))||fast.template||{};
const ds=endpointSummary(deep),fs=endpointSummary(fast),dts=templateSummary(dt),fts=templateSummary(ft);
console.log(JSON.stringify({success:true,contract:CONTRACT,deep_endpoint:ds,fast_endpoint:fs,endpoint_top_level_differences:diff(ds.topLevel,fs.topLevel),deep_template:dts,fast_template:fts,template_top_level_differences:diff(dts.topLevel,fts.topLevel),generation_submitted:false,mutation_performed:false,production_deploy_performed:false,secrets_in_output:false},null,2));
console.log(`${CONTRACT}=PASS`);
