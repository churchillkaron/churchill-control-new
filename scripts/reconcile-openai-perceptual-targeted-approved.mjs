#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const DESIGN = "CHURCHILL_OPENAI_PERCEPTUAL_TARGETED_RECONCILIATION_DESIGN_V1";
const CONTRACT = "CHURCHILL_OPENAI_PERCEPTUAL_TARGETED_RECONCILIATION_V1";
const CHECKPOINT = "CHURCHILL_OPENAI_PERCEPTUAL_TARGETED_RECONCILIATION_CHECKPOINT_V1";
const REVIEW = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";
const FAILURE = "GENERATED_MEDIA_PERCEPTUAL_VALIDATION_FAILED";
const APPROVED_BY = "AVANTIQO_AUTOMATED_PERCEPTUAL_GATE";

const text = (v) => String(v ?? "").trim();
const obj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const arr = (v) => Array.isArray(v) ? v.filter(Boolean) : [];
const money = (v) => Number(Number(v || 0).toFixed(6));
function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (!v || typeof v !== "object") return v;
  return Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])]));
}
function sha(v) {
  return crypto.createHash("sha256")
    .update(typeof v === "string" ? v : JSON.stringify(stable(v)))
    .digest("hex");
}
function read(file, label) {
  const absolute = path.resolve(text(file));
  if (!absolute || !fs.existsSync(absolute)) throw new Error(`${label}_NOT_FOUND:${absolute}`);
  const raw = fs.readFileSync(absolute, "utf8");
  return { absolute, raw, file_sha256: sha(raw), value: JSON.parse(raw) };
}
function write(file, value) {
  const absolute = path.resolve(file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function nodeId(t = {}) { return text(t.metadata?.execution_node_id || t.input?.node_id); }
function sourceId(t = {}) {
  return text(t.metadata?.source_generation_task_id || t.input?.provider_parameters?.source_generation_task_id);
}
function fullState(t = {}) {
  return { id:t.id, status:t.status, error:t.error||null, depends_on:t.depends_on||[], review:t.review||{}, metadata:t.metadata||{}, output:t.output||{}, timing:t.timing||{}, updated_at:t.updated_at||null };
}
function pairState(t = {}) {
  return { id:t.id, status:t.status, error:t.error||null, review:t.review||{}, metadata:t.metadata||{}, output:t.output||{}, timing:t.timing||{}, updated_at:t.updated_at||null };
}
const pairHash = (t) => sha(pairState(t));
const fingerprint = (tasks) => sha([...tasks].sort((a,b)=>text(a.id).localeCompare(text(b.id))).map(fullState));

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
if (!organizationId || !projectId || !graphId) throw new Error("RECONCILIATION_SCOPE_REQUIRED");

const designFile = read(process.argv[2], "RECONCILIATION_DESIGN");
const design = obj(designFile.value);
const stateSha = text(design.exact_state_before?.task_state_sha256);
if (!stateSha) throw new Error("DESIGN_STATE_SHA_REQUIRED");
const reconciliationId = `churchill-openai-perceptual:${graphId}:${stateSha}`;
const expectedToken = `APPLY:${graphId}:${stateSha}`;
const suppliedToken = text(process.env.APPLY_OPENAI_PERCEPTUAL_RECONCILIATION);
const apply = suppliedToken === expectedToken;
if (suppliedToken && !apply) throw new Error("RECONCILIATION_APPLY_TOKEN_INVALID");
const outputPath = path.resolve(text(process.env.OPENAI_PERCEPTUAL_RECONCILIATION_OUTPUT) || "/tmp/churchill-openai-perceptual-targeted-reconciliation.json");
const checkpointPath = path.resolve(text(process.env.OPENAI_PERCEPTUAL_RECONCILIATION_CHECKPOINT) || "/tmp/churchill-openai-perceptual-targeted-reconciliation-checkpoint.json");

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { ProductionTaskRuntime } = await import("@/lib/operations/tasks/runtime/ProductionTaskRuntime");
const { CreativeGeneratedMediaPerceptualExecutionGate: Gate } = await import("@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate");

async function snapshot() {
  const [tasks, usage, wallet] = await Promise.all([
    ProductionTaskRuntime.list({ organization_id:organizationId, creative_project_id:projectId, production_graph_id:graphId }),
    supabaseAdmin.from("platform_service_usage").select("id", { count:"exact", head:true }).eq("organization_id", organizationId),
    supabaseAdmin.from("organization_wallets").select("available_balance,currency,updated_at").eq("organization_id", organizationId).single(),
  ]);
  if (usage.error) throw usage.error;
  if (wallet.error) throw wallet.error;
  const scoped = tasks.filter((t) => text(t.production_graph_id) === graphId);
  return { tasks:scoped, task_count:scoped.length, task_sha:fingerprint(scoped), usage_count:Number(usage.count||0), wallet:money(wallet.data?.available_balance), wallet_updated_at:wallet.data?.updated_at||null };
}
function sourceApplied(source, review, evaluated) {
  const m = obj(source.output?.targeted_perceptual_reconciliation);
  return text(source.status)==="COMPLETED" && !text(source.error) &&
    source.metadata?.targeted_perceptual_reconciliation===true &&
    text(source.metadata?.targeted_perceptual_reconciliation_id)===reconciliationId &&
    source.metadata?.automated_perceptual_validation_passed===true &&
    source.metadata?.approved_for_downstream_after_perceptual_review===true &&
    source.metadata?.perceptual_validation_failed!==true &&
    source.metadata?.rejected_before_editing!==true &&
    text(source.metadata?.perceptual_review_task_id)===text(review.id) &&
    text(m.reconciliation_id)===reconciliationId &&
    text(m.source_task_id)===text(source.id) &&
    text(m.review_task_id)===text(review.id) &&
    source.output?.perceptual_validation?.passed===true &&
    source.output?.perceptual_validation?.score_contract?.complete===true &&
    source.output?.perceptual_validation?.evidence_policy?.conclusive_provider_verdict===true &&
    evaluated.passed===true;
}
function reviewApplied(review, source, evaluated) {
  const m = obj(review.output?.targeted_perceptual_reconciliation);
  return text(review.status)==="COMPLETED" && !text(review.error) &&
    review.review?.required===false && review.review?.approved===true &&
    text(review.review?.approved_by)===APPROVED_BY &&
    review.metadata?.targeted_perceptual_reconciliation===true &&
    text(review.metadata?.targeted_perceptual_reconciliation_id)===reconciliationId &&
    review.metadata?.automated_perceptual_validation_passed===true &&
    review.metadata?.generated_media_released_for_downstream===true &&
    text(m.reconciliation_id)===reconciliationId &&
    text(m.source_task_id)===text(source.id) &&
    text(m.review_task_id)===text(review.id) &&
    review.output?.perceptual_validation?.passed===true &&
    review.output?.perceptual_validation?.score_contract?.complete===true &&
    review.output?.perceptual_validation?.evidence_policy?.conclusive_provider_verdict===true &&
    evaluated.passed===true;
}
function classify(pair, source, review, evaluated) {
  if (pairHash(source)===text(pair.source_before?.task_sha256) && pairHash(review)===text(pair.review_before?.task_sha256)) return "BEFORE";
  if (sourceApplied(source, review, evaluated) && pairHash(review)===text(pair.review_before?.task_sha256)) return "SOURCE_APPLIED";
  if (sourceApplied(source, review, evaluated) && reviewApplied(review, source, evaluated)) return "APPLIED";
  return "INVALID";
}
function contained(source, review, evaluated) {
  return source && review && text(source.status)==="FAILED" && text(source.error)===FAILURE && text(review.status)==="FAILED" && text(review.error)===FAILURE && evaluated.passed!==true;
}
function marker(pair, at) {
  return { contract:CONTRACT, reconciliation_id:reconciliationId, design_file_sha256:designFile.file_sha256, design_task_state_sha256:stateSha, source_task_id:pair.source_task_id, review_task_id:pair.review_task_id, execution_node_id:pair.execution_node_id, reconciled_at:at };
}

const blockers = [];
const requireValue = (ok, label) => { if (!ok) blockers.push(label); };
requireValue(text(design.contract)===DESIGN, "DESIGN_CONTRACT_INVALID");
requireValue(text(design.organization_id)===organizationId && text(design.creative_project_id)===projectId && text(design.production_graph_id)===graphId, "DESIGN_SCOPE_INVALID");
requireValue(text(design.decision)==="TARGETED_RECONCILIATION_PLAN_4_PAIRS_CONFIRMED" && text(design.readiness)==="READY_FOR_EXPLICIT_RECONCILIATION_SCRIPT", "DESIGN_DECISION_INVALID");
requireValue(design.state_unchanged===true && arr(design.blockers).length===0, "DESIGN_NOT_CLEAN");
requireValue(Number(design.task_count)===27 && Number(design.review_task_count)===13, "DESIGN_COUNTS_INVALID");
requireValue(Number(design.runtime_pass_count)===4 && Number(design.runtime_fail_count)===9 && design.pass_set_matches===true, "DESIGN_RUNTIME_SET_INVALID");
requireValue(arr(design.pairs).length===4 && arr(design.pairs).every((p)=>p.ready===true), "DESIGN_PAIRS_INVALID");
requireValue(arr(design.rejected_containment).length===9, "DESIGN_REJECTED_INVALID");
const scope = obj(design.reconciliation_scope);
requireValue(Number(scope.update_source_tasks)===4 && Number(scope.update_review_tasks)===4 && Number(scope.update_downstream_tasks)===0 && Number(scope.provider_calls)===0 && Number(scope.provider_polls)===0 && Number(scope.retries)===0 && Number(scope.source_regeneration)===0 && Number(scope.finalisation)===0 && Number(scope.publication)===0, "DESIGN_SCOPE_MUTATION_INVALID");
const invariants = obj(design.execution_invariants);
requireValue(invariants.source_first_review_second===true && invariants.exact_task_hash_preconditions_required===true && invariants.idempotent_partial_run_recovery_required===true && invariants.rejected_pairs_must_remain_failed===true && invariants.downstream_tasks_must_not_be_mutated===true, "DESIGN_INVARIANTS_INVALID");

const before = await snapshot();
requireValue(before.task_count===27, "LIVE_TASK_COUNT_INVALID");
const targetIds = new Set(arr(design.pairs).flatMap((p)=>[text(p.source_task_id), text(p.review_task_id)]));
requireValue(targetIds.size===8 && ![...targetIds].some((id)=>!id), "TARGET_ID_SET_INVALID");
const nonTargetSha = fingerprint(before.tasks.filter((t)=>!targetIds.has(t.id)));
let checkpoint = null;
if (fs.existsSync(checkpointPath)) {
  checkpoint = read(checkpointPath, "RECONCILIATION_CHECKPOINT").value;
  requireValue(text(checkpoint.contract)===CHECKPOINT && text(checkpoint.organization_id)===organizationId && text(checkpoint.creative_project_id)===projectId && text(checkpoint.production_graph_id)===graphId && text(checkpoint.design_file_sha256)===designFile.file_sha256 && text(checkpoint.reconciliation_id)===reconciliationId && text(checkpoint.non_target_state_sha256)===nonTargetSha, "CHECKPOINT_INVALID");
}
const exactInitial = before.task_sha===stateSha;
requireValue(exactInitial || checkpoint, "LIVE_STATE_HASH_MISMATCH_WITHOUT_CHECKPOINT");

let map = new Map(before.tasks.map((t)=>[t.id,t]));
const plans = arr(design.pairs).map((pair) => {
  const source = map.get(text(pair.source_task_id));
  const review = map.get(text(pair.review_task_id));
  const issues = [];
  let evaluated = {};
  if (!source) issues.push("SOURCE_MISSING");
  if (!review) issues.push("REVIEW_MISSING");
  if (source && review) {
    if (text(review.metadata?.contract)!==REVIEW || sourceId(review)!==text(source.id)) issues.push("PAIR_LINK_INVALID");
    evaluated = Gate.validation(review);
    if (evaluated.passed!==true || evaluated.score_contract?.complete!==true || evaluated.evidence_policy?.conclusive_provider_verdict!==true || arr(evaluated.evidence?.failures).length || arr(evaluated.evidence?.repair_instructions).length) issues.push("RUNTIME_PASS_NOT_CONCLUSIVE");
  }
  const state = source && review ? classify(pair, source, review, evaluated) : "INVALID";
  if (state==="INVALID") issues.push("PAIR_STATE_INVALID");
  return { pair, state, issues, ready:issues.length===0 };
});
requireValue(plans.every((p)=>p.ready), "PAIR_PREFLIGHT_BLOCKED");
const rejected = arr(design.rejected_containment).map((item) => {
  const source = map.get(text(item.source_task_id));
  const review = map.get(text(item.review_task_id));
  const ok = Boolean(review && contained(source, review, Gate.validation(review)));
  return { item, contained:ok };
});
requireValue(rejected.every((r)=>r.contained), "REJECTED_CONTAINMENT_INVALID");
const preflight = await snapshot();
requireValue(before.task_sha===preflight.task_sha && before.usage_count===preflight.usage_count && before.wallet===preflight.wallet && before.wallet_updated_at===preflight.wallet_updated_at, "PREFLIGHT_STATE_CHANGED");

const writes = [];
if (apply && blockers.length===0) {
  if (!checkpoint) {
    if (!exactInitial) throw new Error("INITIAL_APPLY_REQUIRES_EXACT_STATE");
    checkpoint = { contract:CHECKPOINT, status:"IN_PROGRESS", organization_id:organizationId, creative_project_id:projectId, production_graph_id:graphId, reconciliation_id:reconciliationId, design_file_sha256:designFile.file_sha256, design_task_state_sha256:stateSha, non_target_state_sha256:nonTargetSha, created_at:new Date().toISOString(), updated_at:new Date().toISOString(), completed_pairs:[] };
    write(checkpointPath, checkpoint);
  }
  for (const plan of plans) {
    let live = await snapshot();
    if (fingerprint(live.tasks.filter((t)=>!targetIds.has(t.id)))!==text(checkpoint.non_target_state_sha256)) throw new Error("NON_TARGET_STATE_CHANGED");
    map = new Map(live.tasks.map((t)=>[t.id,t]));
    let source = map.get(text(plan.pair.source_task_id));
    let review = map.get(text(plan.pair.review_task_id));
    let evaluated = Gate.validation(review);
    let state = classify(plan.pair, source, review, evaluated);
    if (state==="BEFORE") {
      const at = new Date().toISOString();
      await ProductionTaskRuntime.update(source.id, { status:"COMPLETED", error:null, metadata:{...obj(source.metadata), perceptual_validation_failed:false, rejected_before_editing:false, automated_perceptual_validation_passed:true, approved_for_downstream_after_perceptual_review:true, perceptual_review_task_id:review.id, targeted_perceptual_reconciliation:true, targeted_perceptual_reconciliation_id:reconciliationId, targeted_perceptual_reconciled_at:at}, output:{...obj(source.output), perceptual_validation:evaluated, targeted_perceptual_reconciliation:marker(plan.pair, at)} });
      writes.push({ task_id:source.id, role:"SOURCE" });
      source = await ProductionTaskRuntime.get(source.id);
      if (!sourceApplied(source, review, evaluated)) throw new Error(`SOURCE_VERIFY_FAILED:${source.id}`);
      checkpoint.updated_at = new Date().toISOString();
      checkpoint.completed_pairs = [...arr(checkpoint.completed_pairs).filter((x)=>text(x.review_task_id)!==text(review.id)), {source_task_id:source.id,review_task_id:review.id,state:"SOURCE_APPLIED",updated_at:checkpoint.updated_at}];
      write(checkpointPath, checkpoint);
      state = "SOURCE_APPLIED";
    }
    if (state==="SOURCE_APPLIED") {
      source = await ProductionTaskRuntime.get(text(plan.pair.source_task_id));
      review = await ProductionTaskRuntime.get(text(plan.pair.review_task_id));
      evaluated = Gate.validation(review);
      if (!sourceApplied(source, review, evaluated) || pairHash(review)!==text(plan.pair.review_before?.task_sha256)) throw new Error(`REVIEW_PRECONDITION_FAILED:${review.id}`);
      const at = new Date().toISOString();
      await ProductionTaskRuntime.update(review.id, { status:"COMPLETED", error:null, review:{...obj(review.review),required:false,approved:true,approved_by:APPROVED_BY}, metadata:{...obj(review.metadata),automated_perceptual_validation_passed:true,generated_media_released_for_downstream:true,targeted_perceptual_reconciliation:true,targeted_perceptual_reconciliation_id:reconciliationId,targeted_perceptual_reconciled_at:at}, output:{...obj(review.output),perceptual_validation:evaluated,targeted_perceptual_reconciliation:marker(plan.pair, at)} });
      writes.push({ task_id:review.id, role:"REVIEW" });
      review = await ProductionTaskRuntime.get(review.id);
      if (!reviewApplied(review, source, evaluated)) throw new Error(`REVIEW_VERIFY_FAILED:${review.id}`);
      checkpoint.updated_at = new Date().toISOString();
      checkpoint.completed_pairs = [...arr(checkpoint.completed_pairs).filter((x)=>text(x.review_task_id)!==text(review.id)), {source_task_id:source.id,review_task_id:review.id,state:"APPLIED",updated_at:checkpoint.updated_at}];
      write(checkpointPath, checkpoint);
      state = "APPLIED";
    }
    if (state!=="APPLIED") throw new Error(`PAIR_NOT_APPLIED:${plan.pair.review_task_id}:${state}`);
  }
}

const after = await snapshot();
map = new Map(after.tasks.map((t)=>[t.id,t]));
const finalPairs = arr(design.pairs).map((pair) => {
  const source = map.get(text(pair.source_task_id));
  const review = map.get(text(pair.review_task_id));
  return { execution_node_id:text(pair.execution_node_id), state:source&&review?classify(pair,source,review,Gate.validation(review)):"INVALID" };
});
if (apply && blockers.length===0) {
  if (!finalPairs.every((p)=>p.state==="APPLIED")) throw new Error("FINAL_PAIR_STATE_INVALID");
  if (fingerprint(after.tasks.filter((t)=>!targetIds.has(t.id)))!==nonTargetSha) throw new Error("FINAL_NON_TARGET_STATE_CHANGED");
  for (const r of rejected) {
    const source = map.get(text(r.item.source_task_id));
    const review = map.get(text(r.item.review_task_id));
    if (!review || !contained(source, review, Gate.validation(review))) throw new Error(`FINAL_REJECTED_PAIR_CHANGED:${r.item.review_task_id}`);
  }
  if (before.task_count!==after.task_count || before.usage_count!==after.usage_count || before.wallet!==after.wallet || before.wallet_updated_at!==after.wallet_updated_at) throw new Error("ACCOUNTING_OR_COUNT_STATE_CHANGED");
  checkpoint.status="COMPLETED";
  checkpoint.updated_at=new Date().toISOString();
  checkpoint.completed_at=checkpoint.updated_at;
  checkpoint.final_task_state_sha256=after.task_sha;
  write(checkpointPath, checkpoint);
}

const decision = blockers.length ? "TARGETED_RECONCILIATION_PREFLIGHT_BLOCKED" : apply ? "TARGETED_RECONCILIATION_4_PAIRS_APPLIED" : "TARGETED_RECONCILIATION_DRY_RUN_READY";
const readiness = blockers.length ? "PREFLIGHT_BLOCKED" : apply ? "READY_FOR_POST_RECONCILIATION_AUDIT" : "READY_FOR_EXPLICIT_APPLY_AUTHORIZATION";
const report = { contract:CONTRACT, generated_at:new Date().toISOString(), organization_id:organizationId, creative_project_id:projectId, production_graph_id:graphId, reconciliation_id:reconciliationId, design_file:designFile.absolute, design_file_sha256:designFile.file_sha256, design_task_state_sha256:stateSha, apply_mode:apply, expected_apply_token:expectedToken, checkpoint_path:checkpointPath, exact_initial_state:exactInitial, blockers, plans:plans.map((p)=>({execution_node_id:text(p.pair.execution_node_id),source_task_id:text(p.pair.source_task_id),review_task_id:text(p.pair.review_task_id),state:p.state,issues:p.issues})), final_pairs:finalPairs, rejected_contained:rejected.every((r)=>r.contained), writes, database_write_count:writes.length, before:{task_count:before.task_count,task_state_sha256:before.task_sha,non_target_state_sha256:nonTargetSha,usage_count:before.usage_count,wallet_balance:before.wallet,wallet_updated_at:before.wallet_updated_at}, after:{task_count:after.task_count,task_state_sha256:after.task_sha,non_target_state_sha256:fingerprint(after.tasks.filter((t)=>!targetIds.has(t.id))),usage_count:after.usage_count,wallet_balance:after.wallet,wallet_updated_at:after.wallet_updated_at}, provider_calls_executed:false,provider_polls_executed:false,retries_executed:false,source_regeneration_executed:false,downstream_tasks_updated:0,finalisation_executed:false,publication_executed:false,decision,readiness };
write(outputPath, report);

console.log("============================================================");
console.log("OPENAI PERCEPTUAL TARGETED RECONCILIATION");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`APPLY_MODE=${apply?"YES":"NO"}`);
console.log(`EXPECTED_APPLY_TOKEN=${expectedToken}`);
console.log(`CHECKPOINT_PATH=${checkpointPath}`);
console.log(`EXACT_INITIAL_STATE=${exactInitial?"YES":"NO"}`);
for (const p of report.plans) console.log(`RECONCILIATION_PLAN=${p.execution_node_id}|source=${p.source_task_id}|review=${p.review_task_id}|classification=${p.state}|blockers=${p.issues.join(",")}|ready=${p.issues.length?"NO":"YES"}`);
for (const p of finalPairs) console.log(`FINAL_PAIR_STATE=${p.execution_node_id}|classification=${p.state}`);
console.log(`REJECTED_PAIRS_CONTAINED=${report.rejected_contained?"YES":"NO"}`);
console.log(`RECONCILIATION_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`DATABASE_WRITE_COUNT=${writes.length}`);
console.log(`TASK_STATE_SHA256_BEFORE=${before.task_sha}`);
console.log(`TASK_STATE_SHA256_AFTER=${after.task_sha}`);
console.log(`NON_TARGET_STATE_SHA256_BEFORE=${nonTargetSha}`);
console.log(`NON_TARGET_STATE_SHA256_AFTER=${report.after.non_target_state_sha256}`);
console.log(`TASK_COUNT_BEFORE=${before.task_count}`);
console.log(`TASK_COUNT_AFTER=${after.task_count}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet}`);
console.log(`STATE_UNCHANGED=${before.task_sha===after.task_sha && before.usage_count===after.usage_count && before.wallet===after.wallet && before.wallet_updated_at===after.wallet_updated_at?"YES":"NO"}`);
console.log(`RECONCILIATION_DECISION=${decision}`);
console.log(`AUDIT_READINESS=${readiness}`);
console.log(`DATABASE_WRITES_EXECUTED=${writes.length?"YES":"NO"}`);
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("RETRIES_EXECUTED=NO");
console.log("SOURCE_REGENERATION_EXECUTED=NO");
console.log("DOWNSTREAM_TASKS_UPDATED=0");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");
if (blockers.length) process.exitCode=2;
