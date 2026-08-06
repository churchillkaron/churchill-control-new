#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const PLAN = "CHURCHILL_OPENAI_PERCEPTUAL_REJECTED_MEDIA_REPAIR_PLAN_V1";
const PREVIEW = "CHURCHILL_OPENAI_PERCEPTUAL_PAIR_REPAIR_RUNTIME_PREVIEW_V1";
const CHECKPOINT = "CHURCHILL_OPENAI_PERCEPTUAL_PAIR_REPAIR_TASK_CREATION_CHECKPOINT_V1";
const RESULT = "CHURCHILL_OPENAI_PERCEPTUAL_PAIR_REPAIR_TASK_CREATION_V1";
const COST = 208.187686;
const CURRENCY = "THB";
const t = (v) => String(v ?? "").trim();
const o = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const a = (v) => Array.isArray(v) ? v.filter(Boolean) : [];
const money = (v) => Number(Number(v || 0).toFixed(6));
function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (!v || typeof v !== "object") return v;
  return Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])]));
}
const hash = (v) => crypto.createHash("sha256")
  .update(typeof v === "string" ? v : JSON.stringify(stable(v))).digest("hex");
function read(file, label) {
  const absolute = path.resolve(t(file));
  if (!absolute || !fs.existsSync(absolute)) throw new Error(`${label}_NOT_FOUND:${absolute}`);
  const raw = fs.readFileSync(absolute, "utf8");
  return { absolute, raw, sha256: hash(raw), value: JSON.parse(raw) };
}
function write(file, value) {
  const absolute = path.resolve(file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function taskState(x = {}) {
  return { id:x.id,status:x.status,error:x.error||null,depends_on:x.depends_on||[],review:x.review||{},metadata:x.metadata||{},output:x.output||{},timing:x.timing||{},updated_at:x.updated_at||null };
}
const fingerprint = (tasks) => hash([...tasks].sort((x,y)=>t(x.id).localeCompare(t(y.id))).map(taskState));
function core(x = {}) {
  return {
    id:x.id, organization_id:x.organization_id, creative_project_id:x.creative_project_id??null,
    production_graph_id:x.production_graph_id??null, scene_id:x.scene_id??null, shot_id:x.shot_id??null,
    type:x.type, status:x.status, title:x.title??"", description:x.description??"",
    service_id:x.service_id??null, provider_id:x.provider_id??null,
    service_code:x.service_code??x.service_id??null, capability:x.capability??null,
    priority:Number(x.priority??100), depends_on:x.depends_on??[], input:x.input??{}, output:x.output??{},
    cost:{currency:x.cost?.currency??null,estimated:Number(x.cost?.estimated??0),actual:Number(x.cost?.actual??0),approved:x.cost?.approved??false},
    timing:{estimated_seconds:Number(x.timing?.estimated_seconds??0),started_at:x.timing?.started_at??null,completed_at:x.timing?.completed_at??null},
    review:{required:x.review?.required??true,approved:x.review?.approved??false,approved_by:x.review?.approved_by??null,notes:x.review?.notes??""},
    error:x.error??null, metadata:x.metadata??{}, created_by:x.created_by??null,
  };
}
const sameTask = (live, payload) => hash(core(live)) === hash(core(payload));
function beforeBookkeeping(x = {}) {
  const metadata = { ...o(x.metadata) };
  for (const k of ["superseded_by_repair_task_id","superseded_by_repair_review_task_id","repair_identity","repair_attempt","repair_attempted","pair_aware_repair","pair_repair_creation_id","pair_repair_preview_file_sha256"]) delete metadata[k];
  return { ...x, metadata };
}
function pairState({ source, review, rs, rr, rsp, rrp, creationId }) {
  if (!source || !review) return "INVALID";
  const sm = rs && sameTask(rs, rsp), rm = rr && sameTask(rr, rrp);
  const ss = t(source.metadata?.superseded_by_repair_task_id);
  const sr = t(review.metadata?.superseded_by_repair_review_task_id);
  const sc = t(source.metadata?.pair_repair_creation_id);
  const rc = t(review.metadata?.pair_repair_creation_id);
  if (!rs && !rr && !ss && !sr) return "BEFORE";
  if (sm && !rr && !ss && !sr) return "SOURCE_CREATED";
  if (sm && rm && !ss && !sr) return "PAIR_CREATED";
  if (sm && rm && ss === rsp.id && sc === creationId && !sr) return "SOURCE_SUPERSEDED";
  if (sm && rm && ss === rsp.id && sc === creationId && sr === rrp.id && rc === creationId) return "APPLIED";
  return "INVALID";
}
function counts(tasks) {
  return tasks.reduce((r,x) => { r[x.status] = (r[x.status]||0)+1; return r; }, {});
}
async function state(supabaseAdmin, ProductionTaskRuntime, organizationId, projectId, graphId) {
  const [tasks, usage, wallet] = await Promise.all([
    ProductionTaskRuntime.list({ organization_id:organizationId, creative_project_id:projectId, production_graph_id:graphId }),
    supabaseAdmin.from("platform_service_usage").select("id",{count:"exact",head:true}).eq("organization_id",organizationId),
    supabaseAdmin.from("organization_wallets").select("available_balance,currency,updated_at").eq("organization_id",organizationId).single(),
  ]);
  if (usage.error) throw usage.error;
  if (wallet.error) throw wallet.error;
  const scoped = tasks.filter((x)=>t(x.production_graph_id)===graphId);
  return { tasks:scoped,count:scoped.length,status_counts:counts(scoped),sha256:fingerprint(scoped),usage:Number(usage.count||0),wallet:money(wallet.data?.available_balance),wallet_updated_at:wallet.data?.updated_at||null };
}

const planFile = read(process.argv[2], "PAIR_REPAIR_PLAN");
const previewFile = read(process.argv[3], "PAIR_REPAIR_PREVIEW");
const plan = o(planFile.value), preview = o(previewFile.value);
const organizationId = t(process.env.ORGANIZATION_ID);
const projectId = t(process.env.CREATIVE_PROJECT_ID);
const graphId = t(process.env.PRODUCTION_GRAPH_ID);
if (!organizationId || !projectId || !graphId) throw new Error("PAIR_REPAIR_TASK_CREATION_SCOPE_REQUIRED");
const output = path.resolve(t(process.env.OPENAI_PERCEPTUAL_PAIR_REPAIR_CREATION_OUTPUT)||"/tmp/churchill-openai-perceptual-pair-repair-task-creation.json");
const checkpointPath = path.resolve(t(process.env.OPENAI_PERCEPTUAL_PAIR_REPAIR_CREATION_CHECKPOINT)||"/tmp/churchill-openai-perceptual-pair-repair-task-creation-checkpoint.json");
const initialSha = t(plan.exact_state_before?.task_state_sha256);
if (!initialSha) throw new Error("PAIR_REPAIR_PLAN_STATE_SHA_REQUIRED");
const expectedCost = `AUTHORIZE PAIR REPAIR TASK CREATION MAX ${COST.toFixed(6)} ${CURRENCY}`;
const expectedToken = `CREATE:${graphId}:${initialSha}:${previewFile.sha256}`;
const suppliedCost = t(process.env.PAIR_REPAIR_TASK_CREATION_COST_AUTHORIZATION);
const suppliedToken = t(process.env.PAIR_REPAIR_TASK_CREATION_TOKEN);
const anyAuth = Boolean(suppliedCost || suppliedToken);
const apply = suppliedCost === expectedCost && suppliedToken === expectedToken;
if (anyAuth && !apply) throw new Error("PAIR_REPAIR_TASK_CREATION_AUTHORIZATION_INVALID");
const creationId = `churchill-pair-repair-create:${graphId}:${initialSha}:${previewFile.sha256}`;

const [{supabaseAdmin},{ProductionTaskRuntime},{CreativeGeneratedMediaPerceptualPairRepairRuntime:Runtime}] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualPairRepairRuntime"),
]);
const blockers = [];
const req = (ok,label) => { if (!ok) blockers.push(label); };
req(t(plan.contract)===PLAN,"PLAN_CONTRACT_INVALID");
req(t(preview.contract)===PREVIEW,"PREVIEW_CONTRACT_INVALID");
req(t(plan.organization_id)===organizationId&&t(plan.creative_project_id)===projectId&&t(plan.production_graph_id)===graphId,"PLAN_SCOPE_INVALID");
req(t(preview.organization_id)===organizationId&&t(preview.creative_project_id)===projectId&&t(preview.production_graph_id)===graphId,"PREVIEW_SCOPE_INVALID");
req(t(plan.decision)==="PAIR_AWARE_REPAIR_PLAN_9_PAIRS_CONFIRMED"&&t(plan.readiness)==="READY_FOR_PAIR_AWARE_REPAIR_RUNTIME_DESIGN"&&a(plan.blockers).length===0&&plan.state_unchanged===true,"PLAN_NOT_READY");
req(t(preview.decision)==="PAIR_REPAIR_RUNTIME_9_PAIR_PAYLOADS_CONFIRMED"&&t(preview.readiness)==="READY_FOR_GUARDED_REPAIR_TASK_CREATION_DESIGN"&&a(preview.blockers).length===0&&preview.state_unchanged===true,"PREVIEW_NOT_READY");
req(Number(plan.recovered_pair_count)===4&&Number(plan.rejected_pair_count)===9&&Number(plan.recovered_source_regeneration_scope)===0,"PLAN_COUNTS_INVALID");
req(Number(preview.original_task_count)===27&&Number(preview.preview_pair_count)===9&&Number(preview.preview_total_task_count)===18&&Number(preview.existing_id_collision_count)===0&&Number(preview.deterministic_id_collision_count)===0&&Number(preview.promptless_pair_count)===9&&Number(preview.provider_bound_count)===0&&Number(preview.cost_approved_count)===0,"PREVIEW_COUNTS_INVALID");
req(money(plan.estimated_repair_cost)===COST&&money(preview.estimated_repair_cost)===COST&&t(plan.estimated_repair_cost_currency)===CURRENCY&&t(preview.estimated_repair_cost_currency)===CURRENCY,"COST_CONTRACT_INVALID");
req(Number(plan.planned_downstream_rewires)===0&&a(plan.repair_plans).every((x)=>a(x.direct_review_dependents).length===0),"DOWNSTREAM_REWIRE_SCOPE_INVALID");
req(plan.repair_cost_authorized===false&&plan.provider_selection_authorized===false&&plan.repair_dispatch_authorized===false,"PLAN_ALREADY_AUTHORIZED");

const before = await state(supabaseAdmin,ProductionTaskRuntime,organizationId,projectId,graphId);
let checkpoint = null;
if (fs.existsSync(checkpointPath)) checkpoint = read(checkpointPath,"PAIR_REPAIR_CREATION_CHECKPOINT").value;
if (checkpoint) req(t(checkpoint.contract)===CHECKPOINT&&t(checkpoint.organization_id)===organizationId&&t(checkpoint.creative_project_id)===projectId&&t(checkpoint.production_graph_id)===graphId&&t(checkpoint.creation_id)===creationId&&t(checkpoint.plan_file_sha256)===planFile.sha256&&t(checkpoint.preview_file_sha256)===previewFile.sha256&&t(checkpoint.initial_task_state_sha256)===initialSha&&a(checkpoint.protected_task_ids).length===9,"CHECKPOINT_INVALID");
const exactInitial = before.sha256===initialSha;
req(exactInitial||Boolean(checkpoint),"STATE_MISMATCH_WITHOUT_CHECKPOINT");
req(exactInitial?before.count===27:before.count>=27&&before.count<=45,"LIVE_TASK_COUNT_INVALID");
if (exactInitial) req(before.usage===Number(plan.exact_state_before?.usage_count)&&before.wallet===money(plan.exact_state_before?.wallet_balance)&&before.wallet_updated_at===plan.exact_state_before?.wallet_updated_at,"ACCOUNTING_STATE_MISMATCH");
const targets = new Set(a(plan.repair_plans).flatMap((x)=>[t(x.source_task_id),t(x.review_task_id)]));
const protectedIds = checkpoint ? new Set(a(checkpoint.protected_task_ids).map(t)) : new Set(before.tasks.filter((x)=>!targets.has(x.id)).map((x)=>x.id));
const protectedBefore = fingerprint(before.tasks.filter((x)=>protectedIds.has(x.id)));
if (checkpoint) req(t(checkpoint.protected_task_state_sha256)===protectedBefore,"PROTECTED_STATE_CHANGED");
const map = new Map(before.tasks.map((x)=>[x.id,x]));
const previewMap = new Map(a(preview.pairs).map((x)=>[t(x.execution_node_id),x]));
const pairs = [];
const ids = new Set();
for (const p of a(plan.repair_plans)) {
  const source = map.get(t(p.source_task_id)), review = map.get(t(p.review_task_id)), rec = previewMap.get(t(p.execution_node_id));
  const issues = [];
  if (!source) issues.push("SOURCE_MISSING");
  if (!review) issues.push("REVIEW_MISSING");
  if (!rec) issues.push("PREVIEW_RECORD_MISSING");
  let generated = null;
  if (source&&review) {
    try { generated = Runtime.previewPair({source:beforeBookkeeping(source),review:beforeBookkeeping(review),plan:p}); }
    catch (e) { issues.push(`RUNTIME_PREVIEW_FAILED:${e.message}`); }
  }
  if (generated&&rec) {
    const rsp=generated.replacement_source_task, rrp=generated.replacement_review_task;
    if (t(rsp.id)!==t(rec.replacement_source_task_id)) issues.push("SOURCE_ID_MISMATCH");
    if (t(rrp.id)!==t(rec.replacement_review_task_id)) issues.push("REVIEW_ID_MISMATCH");
    if (t(generated.pair_payload_sha256)!==t(rec.pair_payload_sha256)) issues.push("PAYLOAD_SHA_MISMATCH");
    if (t(rsp.status)!=="WAITING"||t(rrp.status)!=="WAITING") issues.push("STATUS_INVALID");
    if (rsp.provider_id!==null||rrp.provider_id!==null) issues.push("PROVIDER_BOUND");
    if (rsp.cost?.approved!==false||rrp.cost?.approved!==false) issues.push("COST_APPROVED");
    if (a(rrp.depends_on).length!==1||t(rrp.depends_on[0])!==t(rsp.id)) issues.push("REVIEW_DEPENDENCY_INVALID");
    ids.add(rsp.id); ids.add(rrp.id);
  }
  pairs.push({plan:p,generated,issues,ready:issues.length===0});
}
req(pairs.length===9&&pairs.every((x)=>x.ready),"PAIR_PAYLOADS_INVALID");
req(ids.size===18,"REPLACEMENT_ID_SET_INVALID");
const sourceCost=money(pairs.reduce((s,x)=>s+Number(x.generated?.replacement_source_task?.cost?.estimated||0),0));
const reviewCost=money(pairs.reduce((s,x)=>s+Number(x.generated?.replacement_review_task?.cost?.estimated||0),0));
const totalCost=money(sourceCost+reviewCost);
req(sourceCost===COST,"SOURCE_COST_MISMATCH");
const preflight=await state(supabaseAdmin,ProductionTaskRuntime,organizationId,projectId,graphId);
req(before.sha256===preflight.sha256&&before.usage===preflight.usage&&before.wallet===preflight.wallet&&before.wallet_updated_at===preflight.wallet_updated_at,"PREFLIGHT_STATE_CHANGED");

let writes=0;
function saveStep(p,stateName) {
  const now=new Date().toISOString();
  checkpoint.completed_pairs=[...a(checkpoint.completed_pairs).filter((x)=>t(x.review_task_id)!==t(p.review_task_id)),{source_task_id:p.source_task_id,review_task_id:p.review_task_id,repair_identity:p.repair_identity,state:stateName,updated_at:now}];
  checkpoint.updated_at=now; write(checkpointPath,checkpoint);
}
async function live() {
  const s=await state(supabaseAdmin,ProductionTaskRuntime,organizationId,projectId,graphId);
  return {s,map:new Map(s.tasks.map((x)=>[x.id,x]))};
}
if (apply&&blockers.length===0) {
  if (!checkpoint) {
    if (!exactInitial) throw new Error("INITIAL_APPLY_REQUIRES_EXACT_STATE");
    checkpoint={contract:CHECKPOINT,status:"IN_PROGRESS",organization_id:organizationId,creative_project_id:projectId,production_graph_id:graphId,creation_id:creationId,plan_file_sha256:planFile.sha256,preview_file_sha256:previewFile.sha256,initial_task_state_sha256:initialSha,protected_task_ids:[...protectedIds].sort(),protected_task_state_sha256:protectedBefore,expected_source_cost:COST,expected_currency:CURRENCY,expected_task_ids:[...ids].sort(),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),completed_pairs:[]};
    write(checkpointPath,checkpoint);
  }
  for (const item of pairs) {
    const p=item.plan, rsp=item.generated.replacement_source_task, rrp=item.generated.replacement_review_task;
    let L=await live();
    if (fingerprint(L.s.tasks.filter((x)=>protectedIds.has(x.id)))!==t(checkpoint.protected_task_state_sha256)) throw new Error("PROTECTED_TASK_STATE_CHANGED");
    let source=L.map.get(t(p.source_task_id)),review=L.map.get(t(p.review_task_id)),rs=L.map.get(rsp.id),rr=L.map.get(rrp.id);
    let ps=pairState({source,review,rs,rr,rsp,rrp,creationId});
    if (ps==="BEFORE") { await ProductionTaskRuntime.create(rsp); writes++; rs=await ProductionTaskRuntime.get(rsp.id); if(!sameTask(rs,rsp))throw new Error(`SOURCE_VERIFY_FAILED:${rsp.id}`); saveStep(p,"SOURCE_CREATED"); ps="SOURCE_CREATED"; }
    if (ps==="SOURCE_CREATED") { await ProductionTaskRuntime.create(rrp); writes++; rr=await ProductionTaskRuntime.get(rrp.id); if(!sameTask(rr,rrp))throw new Error(`REVIEW_VERIFY_FAILED:${rrp.id}`); saveStep(p,"PAIR_CREATED"); ps="PAIR_CREATED"; }
    if (ps==="PAIR_CREATED") { source=await ProductionTaskRuntime.get(t(p.source_task_id)); await ProductionTaskRuntime.update(source.id,{metadata:{...o(source.metadata),superseded_by_repair_task_id:rsp.id,repair_identity:p.repair_identity,repair_attempt:p.repair_attempt,repair_attempted:true,pair_aware_repair:true,pair_repair_creation_id:creationId,pair_repair_preview_file_sha256:previewFile.sha256}}); writes++; saveStep(p,"SOURCE_SUPERSEDED"); ps="SOURCE_SUPERSEDED"; }
    if (ps==="SOURCE_SUPERSEDED") { review=await ProductionTaskRuntime.get(t(p.review_task_id)); await ProductionTaskRuntime.update(review.id,{metadata:{...o(review.metadata),superseded_by_repair_review_task_id:rrp.id,repair_identity:p.repair_identity,repair_attempt:p.repair_attempt,repair_attempted:true,pair_aware_repair:true,pair_repair_creation_id:creationId,pair_repair_preview_file_sha256:previewFile.sha256}}); writes++; saveStep(p,"APPLIED"); }
    L=await live();
    if (pairState({source:L.map.get(t(p.source_task_id)),review:L.map.get(t(p.review_task_id)),rs:L.map.get(rsp.id),rr:L.map.get(rrp.id),rsp,rrp,creationId})!=="APPLIED") throw new Error(`PAIR_NOT_APPLIED:${p.review_task_id}`);
  }
}

const after=await state(supabaseAdmin,ProductionTaskRuntime,organizationId,projectId,graphId);
const afterMap=new Map(after.tasks.map((x)=>[x.id,x]));
const finalPairs=pairs.map((item)=>{const p=item.plan,rsp=item.generated?.replacement_source_task,rrp=item.generated?.replacement_review_task;return{execution_node_id:t(p.execution_node_id),source_task_id:t(p.source_task_id),review_task_id:t(p.review_task_id),replacement_source_task_id:rsp?.id||null,replacement_review_task_id:rrp?.id||null,state:rsp&&rrp?pairState({source:afterMap.get(t(p.source_task_id)),review:afterMap.get(t(p.review_task_id)),rs:afterMap.get(rsp.id),rr:afterMap.get(rrp.id),rsp,rrp,creationId}):"INVALID",issues:item.issues};});
const protectedAfter=fingerprint(after.tasks.filter((x)=>protectedIds.has(x.id)));
const replacements=after.tasks.filter((x)=>ids.has(x.id));
const waiting=replacements.filter((x)=>t(x.status)==="WAITING").length;
const providerBound=replacements.filter((x)=>x.provider_id!==null).length;
const costApproved=replacements.filter((x)=>x.cost?.approved===true).length;
if (apply&&blockers.length===0) {
  if(after.count!==45)throw new Error(`FINAL_TASK_COUNT_INVALID:${after.count}`);
  if(replacements.length!==18||waiting!==18)throw new Error("REPLACEMENT_TASK_SET_INVALID");
  if(providerBound!==0||costApproved!==0)throw new Error("REPLACEMENT_AUTHORIZATION_INVALID");
  if(finalPairs.some((x)=>x.state!=="APPLIED"))throw new Error("FINAL_PAIR_STATE_INVALID");
  if(protectedAfter!==protectedBefore)throw new Error("FINAL_PROTECTED_STATE_CHANGED");
  if(before.usage!==after.usage||before.wallet!==after.wallet||before.wallet_updated_at!==after.wallet_updated_at)throw new Error("ACCOUNTING_STATE_CHANGED");
  checkpoint.status="COMPLETED";checkpoint.updated_at=new Date().toISOString();checkpoint.completed_at=checkpoint.updated_at;checkpoint.final_task_count=after.count;checkpoint.final_task_state_sha256=after.sha256;checkpoint.final_protected_task_state_sha256=protectedAfter;write(checkpointPath,checkpoint);
}
const unchanged=before.count===after.count&&before.sha256===after.sha256&&before.usage===after.usage&&before.wallet===after.wallet&&before.wallet_updated_at===after.wallet_updated_at;
const decision=blockers.length?"PAIR_REPAIR_TASK_CREATION_PREFLIGHT_BLOCKED":apply?"PAIR_REPAIR_18_WAITING_TASKS_CREATED":"PAIR_REPAIR_TASK_CREATION_DRY_RUN_READY";
const readiness=blockers.length?"PAIR_REPAIR_TASK_CREATION_BLOCKED":apply?"READY_FOR_POST_CREATION_AUDIT":"READY_FOR_EXPLICIT_TASK_CREATION_AUTHORIZATION";
const report={contract:RESULT,generated_at:new Date().toISOString(),organization_id:organizationId,creative_project_id:projectId,production_graph_id:graphId,creation_id:creationId,plan_file_sha256:planFile.sha256,preview_file_sha256:previewFile.sha256,checkpoint_path:checkpointPath,apply_mode:apply,expected_cost_authorization:expectedCost,expected_creation_token:expectedToken,authorized_source_repair_ceiling:apply?COST:0,provider_selection_authorized:false,provider_spend_authorized:false,dispatch_authorized:false,planned_pair_count:pairs.length,planned_replacement_task_count:ids.size,planned_source_repair_cost:sourceCost,planned_review_cost:reviewCost,planned_total_estimated_cost:totalCost,final_pairs:finalPairs,replacement_task_count:replacements.length,replacement_waiting_count:waiting,replacement_provider_bound_count:providerBound,replacement_cost_approved_count:costApproved,protected_task_state_sha256_before:protectedBefore,protected_task_state_sha256_after:protectedAfter,blockers,database_write_count:writes,before:{task_count:before.count,task_status_counts:before.status_counts,task_state_sha256:before.sha256,usage_count:before.usage,wallet_balance:before.wallet,wallet_updated_at:before.wallet_updated_at},after:{task_count:after.count,task_status_counts:after.status_counts,task_state_sha256:after.sha256,usage_count:after.usage,wallet_balance:after.wallet,wallet_updated_at:after.wallet_updated_at},state_unchanged:unchanged,database_writes_executed:writes>0,provider_calls_executed:false,provider_polls_executed:false,retries_executed:false,source_regeneration_executed:false,downstream_tasks_updated:0,finalisation_eligible:false,finalisation_executed:false,publication_executed:false,decision,readiness};
write(output,report);

console.log("============================================================");
console.log("OPENAI PERCEPTUAL PAIR-REPAIR TASK CREATION");
console.log("============================================================");
console.log(`OUTPUT=${output}`);
console.log(`APPLY_MODE=${apply?"YES":"NO"}`);
console.log(`EXPECTED_COST_AUTHORIZATION=${expectedCost}`);
console.log(`EXPECTED_CREATION_TOKEN=${expectedToken}`);
console.log(`CHECKPOINT_PATH=${checkpointPath}`);
console.log(`EXACT_INITIAL_STATE=${exactInitial?"YES":"NO"}`);
console.log(`PLANNED_PAIR_COUNT=${pairs.length}`);
console.log(`PLANNED_REPLACEMENT_TASK_COUNT=${ids.size}`);
console.log(`PLANNED_SOURCE_REPAIR_COST=${sourceCost}`);
console.log(`PLANNED_REVIEW_COST=${reviewCost}`);
console.log(`PLANNED_TOTAL_ESTIMATED_COST=${totalCost}`);
for(const x of finalPairs)console.log(`PAIR_CREATION_PLAN=${x.execution_node_id}|source=${x.source_task_id}|review=${x.review_task_id}|replacement_source=${x.replacement_source_task_id||""}|replacement_review=${x.replacement_review_task_id||""}|final_state=${x.state}|blockers=${x.issues.join(",")}|ready=${x.issues.length?"NO":"YES"}`);
console.log(`REPLACEMENT_TASK_COUNT=${replacements.length}`);
console.log(`REPLACEMENT_WAITING_COUNT=${waiting}`);
console.log(`REPLACEMENT_PROVIDER_BOUND_COUNT=${providerBound}`);
console.log(`REPLACEMENT_COST_APPROVED_COUNT=${costApproved}`);
console.log(`PAIR_CREATION_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`DATABASE_WRITE_COUNT=${writes}`);
console.log(`TASK_COUNT_BEFORE=${before.count}`);
console.log(`TASK_COUNT_AFTER=${after.count}`);
console.log(`TASK_STATE_SHA256_BEFORE=${before.sha256}`);
console.log(`TASK_STATE_SHA256_AFTER=${after.sha256}`);
console.log(`PROTECTED_STATE_SHA256_BEFORE=${protectedBefore}`);
console.log(`PROTECTED_STATE_SHA256_AFTER=${protectedAfter}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage}`);
console.log(`USAGE_COUNT_AFTER=${after.usage}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet}`);
console.log(`STATE_UNCHANGED=${unchanged?"YES":"NO"}`);
console.log(`PAIR_CREATION_DECISION=${decision}`);
console.log(`AUDIT_READINESS=${readiness}`);
console.log(`DATABASE_WRITES_EXECUTED=${writes?"YES":"NO"}`);
console.log("PROVIDER_SELECTION_AUTHORIZED=NO");
console.log("PROVIDER_SPEND_AUTHORIZED=NO");
console.log("DISPATCH_AUTHORIZED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("RETRIES_EXECUTED=NO");
console.log("SOURCE_REGENERATION_EXECUTED=NO");
console.log("DOWNSTREAM_TASKS_UPDATED=0");
console.log("FINALISATION_ELIGIBLE=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");
if(blockers.length)process.exitCode=2;
