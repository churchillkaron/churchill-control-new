const REST_BASE = "https://rest.runpod.io/v1";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const DEEP_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];
const object = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const key = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!key) throw new Error("RUNPOD_KEY_REQUIRED");
async function get(path){ const r=await fetch(`${REST_BASE}${path}`,{headers:{Authorization:`Bearer ${key}`,Accept:"application/json"},signal:AbortSignal.timeout(30000)}); const raw=await r.text(); if(!r.ok) throw new Error(`HTTP_${r.status}`); return raw?JSON.parse(raw):null; }
function envMap(value){ const pairs=Array.isArray(value)?value.map(e=>[text(e?.key||e?.name),String(e?.value??"")]):Object.entries(object(value)).map(([k,v])=>[k,String(v??"")]); return Object.fromEntries(pairs.filter(([k])=>k)); }
function replaceModel(v){ return String(v).split(DEEP_MODEL).join(FAST_MODEL); }
function expectedFast(deep){ return Object.fromEntries(Object.entries(envMap(deep)).filter(([k])=>!k.toUpperCase().includes("REASONING_PARSER")).map(([k,v])=>[k,replaceModel(v)])); }
function safeValue(k,v){ const u=k.toUpperCase(); if(/TOKEN|KEY|SECRET|PASSWORD|AUTH|FINGERPRINT/.test(u)) return v ? "[PRESENT_REDACTED]" : "[EMPTY]"; if(v.length>300) return `${v.slice(0,120)}...[TRUNCATED]`; return v; }
const endpoints=list(await get("/endpoints?includeTemplate=true&includeWorkers=true"));
const templates=list(await get("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false"));
function one(rows,name){ const m=rows.filter(r=>text(r?.name)===name); if(m.length!==1) throw new Error(`RESOLVE_${name}_${m.length}`); return m[0]; }
function tmpl(ep){ const id=text(ep?.templateId||ep?.template?.id); const t=templates.find(x=>text(x?.id)===id)||ep?.template; if(!t) throw new Error(`TEMPLATE_${id}_MISSING`); return t; }
const deep=tmpl(one(endpoints,DEEP_NAME)); const fast=tmpl(one(endpoints,FAST_NAME));
const expected=expectedFast(deep.env); const actual=envMap(fast.env);
const keys=[...new Set([...Object.keys(expected),...Object.keys(actual)])].sort();
const diffs=keys.filter(k=>expected[k]!==actual[k]).map(k=>({key:k,expected_present:Object.hasOwn(expected,k),actual_present:Object.hasOwn(actual,k),expected:safeValue(k,expected[k]??""),actual:safeValue(k,actual[k]??"")}));
console.log(JSON.stringify({success:true,contract:"AVANTIQO_INTELLIGENCE_FAST_ENV_DIFF_V1",difference_count:diffs.length,differences:diffs,generation_submitted:false,mutation_performed:false,production_deploy_performed:false},null,2));
