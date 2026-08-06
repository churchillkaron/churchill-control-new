#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const t = (v) => String(v ?? "").trim();
const o = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const a = (v) => Array.isArray(v) ? v.filter(Boolean) : [];
const money = (v) => Number(Number(v || 0).toFixed(6));
const stable = (v) => Array.isArray(v) ? v.map(stable) : (!v || typeof v !== "object" ? v : Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])));
const hash = (v) => crypto.createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(stable(v))).digest("hex");
function read(file, label) {
  const absolute = path.resolve(t(file));
  if (!fs.existsSync(absolute)) throw new Error(`${label}_NOT_FOUND:${absolute}`);
  const raw = fs.readFileSync(absolute, "utf8");
  return { absolute, sha256: hash(raw), value: JSON.parse(raw) };
}
function write(file, value) {
  const absolute = path.resolve(file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function taskState(x = {}) {
  return { id:x.id,status:x.status,provider_id:x.provider_id??null,cost:x.cost||{},error:x.error||null,depends_on:x.depends_on||[],review:x.review||{},metadata:x.metadata||{},output:x.output||{},timing:x.timing||{},updated_at:x.updated_at||null };
}
const fingerprint = (tasks) => hash([...tasks].sort((x,y)=>t(x.id).localeCompare(t(y.id))).map(taskState));
const counts = (tasks) => tasks.reduce((r,x)=>{r[t(x.status)||"UNKNOWN"]=(r[t(x.status)||"UNKNOWN"]||0)+1;return r;},{});
const SOURCE = "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_SOURCE_V1";
const REVIEW = "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";
function kind(task = {}) {
  const c = t(task.metadata?.repair_payload_contract);
  return c === SOURCE ? "SOURCE" : c === REVIEW ? "REVIEW" : null;
}
function originalId(task = {}) {
  return kind(task) === "SOURCE" ? t(task.metadata?.repair_of_task_id) : kind(task) === "REVIEW" ? t(task.metadata?.repair_review_of_task_id) : "";
}
function collectNodes(value, nodeKey, out = [], key = "", p = "input", seen = new Set()) {
  if (value == null) return out;
  if (typeof value === "string") {
    if (nodeKey(key) && t(value)) out.push({ path:p, id:t(value) });
    return out;
  }
  if (typeof value !== "object" || seen.has(value)) return out;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item,i)=>collectNodes(item,nodeKey,out,key,`${p}[${i}]`,seen));
    return out;
  }
  for (const [k,v] of Object.entries(value)) {
    if (/provider_prompt|prompt|description|instructions/i.test(k)) continue;
    collectNodes(v,nodeKey,out,k,`${p}.${k}`,seen);
  }
  return out;
}
function aliasEvidence(task, map) {
  const k = kind(task), oid = originalId(task), original = oid ? map.get(oid) : null;
  const replacementNode = t(task.metadata?.execution_node_id);
  const originalNode = t(original?.metadata?.execution_node_id);
  const issues = [];
  if (!k) issues.push("CONTRACT_INVALID");
  if (!original) issues.push("ORIGINAL_MISSING");
  if (!replacementNode || !originalNode) issues.push("NODE_ID_MISSING");
  if (replacementNode === originalNode) issues.push("NODE_NOT_DISTINCT");
  if (task.metadata?.pair_aware_repair !== true || task.metadata?.generated_media_perceptual_pair_repair !== true) issues.push("PAIR_FLAGS_MISSING");
  if (original) {
    for (const key of ["organization_id","creative_project_id","production_graph_id"]) if (t(task[key]) !== t(original[key])) issues.push(`SCOPE_MISMATCH:${key}`);
    if (t(original.status) !== "FAILED") issues.push("ORIGINAL_NOT_FAILED");
    if (t(task.metadata?.repair_identity) !== t(original.metadata?.repair_identity)) issues.push("IDENTITY_MISMATCH");
    if (Number(task.metadata?.repair_attempt||0) !== Number(original.metadata?.repair_attempt||0)) issues.push("ATTEMPT_MISMATCH");
    if (k === "SOURCE" && t(original.metadata?.superseded_by_repair_task_id) !== t(task.id)) issues.push("SOURCE_BACKREF_INVALID");
    if (k === "REVIEW" && t(original.metadata?.superseded_by_repair_review_task_id) !== t(task.id)) issues.push("REVIEW_BACKREF_INVALID");
    if (k === "REVIEW") {
      const sid = t(task.metadata?.repaired_source_task_id), source = sid ? map.get(sid) : null;
      if (!source || kind(source) !== "SOURCE" || a(task.depends_on).length !== 1 || t(task.depends_on[0]) !== sid || t(source.metadata?.repair_quality_task_id) !== oid) issues.push("REVIEW_SOURCE_PAIR_INVALID");
    }
  }
  return { task_id:task.id, kind:k, original_task_id:oid||null, replacement_node_id:replacementNode||null, original_node_id:originalNode||null, issues, valid:issues.length===0 };
}

const previewFile = read(process.argv[2], "BRIDGED_PREVIEW");
const checkpointFile = read(process.argv[3], "DISPATCH_CHECKPOINT");
const activeFile = read(process.argv[4], "ACTIVE_TASK_AUDIT");
const preview = o(previewFile.value), checkpoint = o(checkpointFile.value), active = o(activeFile.value);
const organizationId = t(process.env.ORGANIZATION_ID), projectId = t(process.env.CREATIVE_PROJECT_ID), graphId = t(process.env.PRODUCTION_GRAPH_ID);
const output = path.resolve(t(process.env.OPENAI_PERCEPTUAL_SHOT_ISOLATION_ALIAS_AUDIT_OUTPUT)||"/tmp/churchill-openai-perceptual-repair-shot-isolation-alias-audit.json");
if (!organizationId || !projectId || !graphId) throw new Error("SHOT_ISOLATION_ALIAS_SCOPE_REQUIRED");

const [{supabaseAdmin},{ProductionTaskRuntime},{CreativeShotAssetScopeRuntime}] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/assets/isolation/runtime/CreativeShotAssetScopeRuntime"),
]);
const blockers = [];
const req = (ok,label) => { if (!ok) blockers.push(label); };
req(t(preview.contract)==="CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_MATERIALIZATION_PREVIEW_V1","PREVIEW_CONTRACT_INVALID");
req(t(checkpoint.contract)==="CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_CHECKPOINT_V1","CHECKPOINT_CONTRACT_INVALID");
req(t(active.contract)==="CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_ACTIVE_DOSSIER_TASK_SET_AUDIT_V1","ACTIVE_AUDIT_CONTRACT_INVALID");
for (const [label,v] of [["PREVIEW",preview],["CHECKPOINT",checkpoint],["ACTIVE",active]]) req(t(v.organization_id)===organizationId&&t(v.creative_project_id)===projectId&&t(v.production_graph_id)===graphId,`${label}_SCOPE_INVALID`);
req(t(checkpoint.preview_file_sha256)===previewFile.sha256,"CHECKPOINT_PREVIEW_SHA_INVALID");
req(t(checkpoint.status)==="IN_PROGRESS"&&a(checkpoint.source_records).length===1,"CHECKPOINT_STATE_INVALID");
req(t(active.decision)==="REPAIR_ACTIVE_DOSSIER_TASK_SET_27_ACTIVE_TASKS_CONFIRMED"&&a(active.blockers).length===0&&active.state_unchanged===true,"ACTIVE_AUDIT_NOT_READY");

async function state() {
  const [tasks,usage,wallet] = await Promise.all([
    ProductionTaskRuntime.list({organization_id:organizationId,creative_project_id:projectId,production_graph_id:graphId}),
    supabaseAdmin.from("platform_service_usage").select("id",{count:"exact",head:true}).eq("organization_id",organizationId),
    supabaseAdmin.from("organization_wallets").select("available_balance,updated_at").eq("organization_id",organizationId).single(),
  ]);
  if (usage.error) throw usage.error;
  if (wallet.error) throw wallet.error;
  const scoped = tasks.filter((x)=>t(x.production_graph_id)===graphId);
  return {tasks:scoped,count:scoped.length,status_counts:counts(scoped),sha256:fingerprint(scoped),usage:Number(usage.count||0),wallet:money(wallet.data?.available_balance),wallet_updated_at:wallet.data?.updated_at||null};
}
const before = await state(), map = new Map(before.tasks.map((x)=>[x.id,x]));
req(before.count===45,"TASK_COUNT_INVALID");
req(before.sha256===t(active.exact_state_after?.task_state_sha256),"TASK_STATE_CHANGED");
req(before.usage===Number(checkpoint.initial_usage_count)&&before.wallet===money(checkpoint.initial_wallet_balance)&&before.wallet_updated_at===checkpoint.initial_wallet_updated_at,"ACCOUNTING_STATE_CHANGED");
const replacements = before.tasks.filter((x)=>kind(x));
const aliases = replacements.map((x)=>aliasEvidence(x,map));
const valid = aliases.filter((x)=>x.valid), invalid = aliases.filter((x)=>!x.valid);
const aliasMap = new Map(valid.map((x)=>[x.replacement_node_id,x.original_node_id]));
req(replacements.length===18&&valid.length===18&&invalid.length===0&&aliasMap.size===18,"ALIAS_SET_INVALID");
req(valid.filter((x)=>x.kind==="SOURCE").length===9&&valid.filter((x)=>x.kind==="REVIEW").length===9,"ALIAS_KIND_COUNTS_INVALID");

const audits = replacements.map((task)=>{
  const scope=o(task.input?.requirements?.asset_scope), allowed=new Set(a(scope.authorized_production_node_ids).map(t));
  const refs=collectNodes(task.input,CreativeShotAssetScopeRuntime.productionNodeKey).map((entry)=>{
    const original=aliasMap.get(entry.id)||null, direct=allowed.has(entry.id), alias=Boolean(original&&allowed.has(original));
    return {...entry,alias_original_node_id:original,direct,alias,allowed:direct||alias};
  });
  const deps=a(task.depends_on).map((id)=>{
    const dep=map.get(t(id)), node=t(dep?.metadata?.execution_node_id), original=aliasMap.get(node)||null, direct=Boolean(node&&allowed.has(node)), alias=Boolean(original&&allowed.has(original));
    return {task_id:t(id),node_id:node||null,alias_original_node_id:original,direct,alias,allowed:Boolean(dep)&&(direct||alias)};
  });
  const own=aliases.find((x)=>x.task_id===task.id), issues=[];
  if (!CreativeShotAssetScopeRuntime.verify(scope)) issues.push("SCOPE_INVALID");
  if (t(task.metadata?.asset_scope_hash)!==t(scope.scope_hash)) issues.push("SCOPE_HASH_MISMATCH");
  if (refs.some((x)=>!x.allowed)) issues.push("NODE_REFERENCE_BLOCKED");
  if (deps.some((x)=>!x.allowed)) issues.push("DEPENDENCY_BLOCKED");
  if (!own?.valid||!allowed.has(own.original_node_id)||!refs.some((x)=>x.id===own.replacement_node_id&&x.alias)) issues.push("OWN_ALIAS_NOT_PROVEN");
  return {task_id:task.id,kind:kind(task),original_task_id:own?.original_task_id||null,replacement_node_id:own?.replacement_node_id||null,original_node_id:own?.original_node_id||null,references:refs.length,direct_references:refs.filter((x)=>x.direct).length,alias_references:refs.filter((x)=>x.alias).length,dependencies:deps.length,alias_dependencies:deps.filter((x)=>x.alias).length,issues,ready:issues.length===0};
});
const sourceReady=audits.filter((x)=>x.kind==="SOURCE"&&x.ready).length, reviewReady=audits.filter((x)=>x.kind==="REVIEW"&&x.ready).length, failed=audits.filter((x)=>!x.ready).length;
req(sourceReady===9&&reviewReady===9&&failed===0,"ISOLATION_ALIAS_AUDIT_INVALID");
const plans=a(preview.dispatch_plans), dispatchSha=t(preview.dispatch_contract_sha256);
const sourceStates=plans.map((p)=>{const x=map.get(t(p.source_task_id)), auth=o(x?.metadata?.repair_source_dispatch_authorization), authorized=auth.contract==="CREATIVE_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_AUTHORIZATION_V1"&&t(auth.dispatch_contract_sha256)===dispatchSha&&auth.dispatch_authorized===true&&x?.metadata?.dispatch_authorized===true;return authorized?"AUTHORIZED_WAITING":"READY";});
const authorized=sourceStates.filter((x)=>x==="AUTHORIZED_WAITING").length, ready=sourceStates.filter((x)=>x==="READY").length;
req(plans.length===9&&authorized===1&&ready===8,"PARTIAL_DISPATCH_STATE_INVALID");
const after=await state(), unchanged=before.sha256===after.sha256&&before.usage===after.usage&&before.wallet===after.wallet&&before.wallet_updated_at===after.wallet_updated_at;
if(!unchanged) blockers.push("READ_ONLY_AUDIT_CHANGED_STATE");
const refCount=audits.reduce((s,x)=>s+x.references,0), aliasRefCount=audits.reduce((s,x)=>s+x.alias_references,0), aliasDepCount=audits.reduce((s,x)=>s+x.alias_dependencies,0);
const decision=blockers.length?"REPAIR_SHOT_ISOLATION_ALIAS_AUDIT_BLOCKED":"REPAIR_SHOT_ISOLATION_18_VALID_NODE_ALIASES_CONFIRMED";
const readiness=blockers.length?"REPAIR_SHOT_ISOLATION_ALIAS_AUDIT_BLOCKED":"READY_FOR_SUPERSESSION_AWARE_SHOT_ISOLATION_GATE_RUNTIME_FIX";
const report={contract:"CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SHOT_ISOLATION_ALIAS_AUDIT_V1",generated_at:new Date().toISOString(),organization_id:organizationId,creative_project_id:projectId,production_graph_id:graphId,replacement_task_count:replacements.length,valid_alias_count:valid.length,invalid_alias_count:invalid.length,source_alias_count:valid.filter((x)=>x.kind==="SOURCE").length,review_alias_count:valid.filter((x)=>x.kind==="REVIEW").length,source_isolation_ready_count:sourceReady,review_isolation_ready_count:reviewReady,failed_isolation_audit_count:failed,production_node_reference_count:refCount,alias_reference_count:aliasRefCount,alias_dependency_count:aliasDepCount,authorized_waiting_count:authorized,ready_count:ready,aliases,audits,blockers,decision,state_unchanged:unchanged,exact_state_before:before,exact_state_after:after,database_writes_executed:false,wallet_reservations_executed:false,provider_calls_executed:false,provider_polls_executed:false,review_execution_executed:false,finalisation_executed:false,publication_executed:false,readiness};
write(output,report);
console.log("============================================================");
console.log("READ-ONLY REPAIR SHOT-ISOLATION NODE-ALIAS AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${output}`);
console.log(`TASK_COUNT=${before.count}`);
console.log(`TASK_STATUS_COUNTS=${JSON.stringify(before.status_counts)}`);
console.log(`REPLACEMENT_TASK_COUNT=${replacements.length}`);
console.log(`VALID_ALIAS_COUNT=${valid.length}`);
console.log(`INVALID_ALIAS_COUNT=${invalid.length}`);
console.log(`SOURCE_ALIAS_COUNT=${valid.filter((x)=>x.kind==="SOURCE").length}`);
console.log(`REVIEW_ALIAS_COUNT=${valid.filter((x)=>x.kind==="REVIEW").length}`);
console.log(`SOURCE_ISOLATION_READY_COUNT=${sourceReady}`);
console.log(`REVIEW_ISOLATION_READY_COUNT=${reviewReady}`);
console.log(`FAILED_ISOLATION_AUDIT_COUNT=${failed}`);
console.log(`PRODUCTION_NODE_REFERENCE_COUNT=${refCount}`);
console.log(`ALIAS_REFERENCE_COUNT=${aliasRefCount}`);
console.log(`ALIAS_DEPENDENCY_COUNT=${aliasDepCount}`);
console.log(`AUTHORIZED_WAITING_COUNT=${authorized}`);
console.log(`READY_COUNT=${ready}`);
for(const x of audits)console.log(`SHOT_ISOLATION_ALIAS=${x.task_id}|kind=${x.kind}|original_task=${x.original_task_id||""}|replacement_node=${x.replacement_node_id||""}|original_node=${x.original_node_id||""}|references=${x.references}|direct=${x.direct_references}|aliases=${x.alias_references}|dependencies=${x.dependencies}|alias_dependencies=${x.alias_dependencies}|issues=${x.issues.join(",")}|ready=${x.ready?"YES":"NO"}`);
console.log(`SHOT_ISOLATION_ALIAS_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`SHOT_ISOLATION_ALIAS_DECISION=${decision}`);
console.log(`TASK_STATE_SHA256_BEFORE=${before.sha256}`);
console.log(`TASK_STATE_SHA256_AFTER=${after.sha256}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage}`);
console.log(`USAGE_COUNT_AFTER=${after.usage}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet}`);
console.log(`STATE_UNCHANGED=${unchanged?"YES":"NO"}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("WALLET_RESERVATIONS_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("REVIEW_EXECUTION_EXECUTED=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log(`AUDIT_READINESS=${readiness}`);
console.log("TERMINAL_REMAINS_OPEN=YES");
if(blockers.length||!unchanged)process.exitCode=2;
