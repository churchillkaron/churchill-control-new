#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const ALIAS_AUDIT_CONTRACT = "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SHOT_ISOLATION_ALIAS_AUDIT_V1";
const BOUNDARY_AUDIT_CONTRACT = "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_MATERIALIZATION_CONTRACT_ISOLATION_BOUNDARY_AUDIT_V2";
const CHECKPOINT_CONTRACT = "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_CHECKPOINT_V1";
const REPORT_CONTRACT = "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SHOT_ISOLATION_GATE_VERIFICATION_V2";
const SOURCE_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_SOURCE_V1";
const REVIEW_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const money = (value) => Number(Number(value || 0).toFixed(6));
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(stable(value))).digest("hex");
function readJson(filePath, label) {
  const absolute = path.resolve(text(filePath));
  if (!fs.existsSync(absolute)) throw new Error(`${label}_NOT_FOUND:${absolute}`);
  const raw = fs.readFileSync(absolute, "utf8");
  return { absolute, raw, file_sha256: sha256(raw), value: JSON.parse(raw) };
}
function writeJson(filePath, value) {
  const absolute = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function taskState(task = {}) {
  return { id:task.id,status:task.status,provider_id:task.provider_id??null,cost:task.cost||{},error:task.error||null,depends_on:task.depends_on||[],review:task.review||{},metadata:task.metadata||{},output:task.output||{},timing:task.timing||{},updated_at:task.updated_at||null };
}
const taskFingerprint = (tasks = []) => sha256([...tasks].sort((a,b)=>text(a.id).localeCompare(text(b.id))).map(taskState));
const taskCounts = (tasks = []) => tasks.reduce((r,t)=>{const s=text(t.status)||"UNKNOWN";r[s]=Number(r[s]||0)+1;return r;},{});
function repairKind(task = {}) {
  const contract = text(task.metadata?.repair_payload_contract);
  if (contract === SOURCE_CONTRACT) return "SOURCE";
  if (contract === REVIEW_CONTRACT) return "REVIEW";
  return null;
}
async function exactState({ supabaseAdmin, ProductionTaskRuntime, organizationId, projectId, graphId }) {
  const [tasks, usage, wallet] = await Promise.all([
    ProductionTaskRuntime.list({ organization_id:organizationId, creative_project_id:projectId, production_graph_id:graphId }),
    supabaseAdmin.from("platform_service_usage").select("id", { count:"exact", head:true }).eq("organization_id", organizationId),
    supabaseAdmin.from("organization_wallets").select("available_balance,currency,updated_at").eq("organization_id", organizationId).single(),
  ]);
  if (usage.error) throw usage.error;
  if (wallet.error) throw wallet.error;
  const scoped = tasks.filter((task)=>text(task.production_graph_id)===graphId);
  return { tasks:scoped, task_count:scoped.length, task_status_counts:taskCounts(scoped), task_state_sha256:taskFingerprint(scoped), usage_count:Number(usage.count||0), wallet_balance:money(wallet.data?.available_balance), wallet_updated_at:wallet.data?.updated_at||null };
}

const aliasFile = readJson(process.argv[2], "ALIAS_AUDIT");
const boundaryFile = readJson(process.argv[3], "BOUNDARY_AUDIT_V2");
const checkpointFile = readJson(process.argv[4], "CHECKPOINT");
const aliasAudit = object(aliasFile.value);
const boundaryAudit = object(boundaryFile.value);
const checkpoint = object(checkpointFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(text(process.env.OPENAI_PERCEPTUAL_SHOT_ISOLATION_GATE_VERIFY_V2_OUTPUT) || "/tmp/churchill-openai-perceptual-repair-shot-isolation-gate-verification-v2.json");
if (!organizationId || !projectId || !graphId) throw new Error("SHOT_ISOLATION_GATE_VERIFY_V2_SCOPE_REQUIRED");

const [{ supabaseAdmin }, { ProductionTaskRuntime }, { CreativeShotAssetIsolationExecutionGate }] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/assets/isolation/runtime/CreativeShotAssetIsolationExecutionGate"),
]);

const blockers = [];
const requireValue = (condition, label) => { if (!condition) blockers.push(label); };
requireValue(text(aliasAudit.contract)===ALIAS_AUDIT_CONTRACT, "ALIAS_AUDIT_CONTRACT_INVALID");
requireValue(text(boundaryAudit.contract)===BOUNDARY_AUDIT_CONTRACT, "BOUNDARY_AUDIT_CONTRACT_INVALID");
requireValue(text(checkpoint.contract)===CHECKPOINT_CONTRACT, "CHECKPOINT_CONTRACT_INVALID");
for (const [label,value] of [["ALIAS",aliasAudit],["BOUNDARY",boundaryAudit],["CHECKPOINT",checkpoint]]) {
  requireValue(text(value.organization_id)===organizationId && text(value.creative_project_id)===projectId && text(value.production_graph_id)===graphId, `${label}_SCOPE_INVALID`);
}
requireValue(Number(aliasAudit.valid_alias_count)===18 && Number(aliasAudit.invalid_alias_count)===0 && list(aliasAudit.aliases).length===18, "ALIAS_PROOF_INVALID");
requireValue(text(boundaryAudit.decision)==="MATERIALIZATION_CONTRACT_ISOLATION_BOUNDARY_2_FALSE_POSITIVES_CONFIRMED" && list(boundaryAudit.blockers).length===0 && Number(boundaryAudit.source_passed_count)===9 && Number(boundaryAudit.review_passed_count)===9 && Number(boundaryAudit.failed_count)===0 && Number(boundaryAudit.boundary_confirmed_count)===2 && boundaryAudit.state_unchanged===true, "BOUNDARY_PROOF_INVALID");
requireValue(text(checkpoint.status)==="IN_PROGRESS" && list(checkpoint.source_records).length===1 && Number(checkpoint.initial_task_count)===45 && Number(checkpoint.initial_usage_count)===2658 && money(checkpoint.initial_wallet_balance)===9300.972022, "CHECKPOINT_STATE_INVALID");

const before = await exactState({ supabaseAdmin, ProductionTaskRuntime, organizationId, projectId, graphId });
const replacements = before.tasks.filter((task)=>repairKind(task));
requireValue(before.task_count===45, "TASK_COUNT_INVALID");
requireValue(Number(before.task_status_counts.COMPLETED||0)===9 && Number(before.task_status_counts.WAITING||0)===18 && Number(before.task_status_counts.FAILED||0)===18, "TASK_STATUS_COUNTS_INVALID");
requireValue(before.usage_count===Number(checkpoint.initial_usage_count) && before.wallet_balance===money(checkpoint.initial_wallet_balance) && before.wallet_updated_at===checkpoint.initial_wallet_updated_at, "ACCOUNTING_STATE_CHANGED");
requireValue(replacements.length===18, "REPLACEMENT_COUNT_INVALID");

const verifications = [];
for (const task of replacements) {
  const issues = [];
  let proof = null;
  try { proof = await CreativeShotAssetIsolationExecutionGate.evidence(task); }
  catch (error) { issues.push(error.message); }
  const kind = repairKind(task);
  const ownNodeId = text(task.metadata?.execution_node_id);
  const graphAlias = list(proof?.repairAliasEvidence).find((item)=>text(item.task_id)===text(task.id) && item.valid===true && text(item.replacement_node_id)===ownNodeId);
  if (proof) {
    if (!proof.materializationContractVerified) issues.push("MATERIALIZATION_CONTRACT_NOT_VERIFIED");
    if (!graphAlias) issues.push("GRAPH_REPAIR_ALIAS_NOT_VERIFIED");
    if (list(proof.repairAliasEvidence).length!==18) issues.push("GRAPH_ALIAS_EVIDENCE_COUNT_INVALID");
    if (kind==="SOURCE" && list(task.depends_on).length!==0) issues.push("SOURCE_DEPENDENCY_COUNT_INVALID");
    if (kind==="REVIEW" && (list(task.depends_on).length!==1 || proof.dependencies.taskIds.size!==1 || proof.dependencies.repairAliases.length!==1)) issues.push("REVIEW_DEPENDENCY_ALIAS_INVALID");
  }
  verifications.push({ task_id:task.id, kind, execution_node_id:ownNodeId||null, materialization_contract_verified:Boolean(proof?.materializationContractVerified), graph_alias_verified:Boolean(graphAlias), creative_asset_count:proof?.creativeIds?.size||0, asset_node_count:proof?.assetNodeIds?.size||0, authorized_production_node_count:proof?.productionNodeIds?.size||0, input_production_node_reference_count:proof?.ids?.productionNodes?.length||0, input_asset_node_reference_count:proof?.ids?.assetNodes?.length||0, allowed_media_count:proof?.allowedUrls?.size||0, dependency_task_count:proof?.dependencies?.taskIds?.size||0, active_repair_alias_reference_count:list(proof?.verifiedRepairAliases).length, graph_repair_alias_evidence_count:list(proof?.repairAliasEvidence).length, issues, passed:issues.length===0 });
}

const sourcePassedCount = verifications.filter((item)=>item.kind==="SOURCE"&&item.passed).length;
const reviewPassedCount = verifications.filter((item)=>item.kind==="REVIEW"&&item.passed).length;
const failedCount = verifications.filter((item)=>!item.passed).length;
requireValue(sourcePassedCount===9 && reviewPassedCount===9 && failedCount===0, "ISOLATION_GATE_V2_CHECK_FAILED");

const protectedIds = new Set(list(checkpoint.protected_task_ids).map(text));
const protectedStateSha = taskFingerprint(before.tasks.filter((task)=>protectedIds.has(task.id)));
requireValue(protectedIds.size===36 && protectedStateSha===text(checkpoint.protected_task_state_sha256), "PROTECTED_TASK_STATE_CHANGED");

const after = await exactState({ supabaseAdmin, ProductionTaskRuntime, organizationId, projectId, graphId });
const unchanged = before.task_state_sha256===after.task_state_sha256 && before.usage_count===after.usage_count && before.wallet_balance===after.wallet_balance && before.wallet_updated_at===after.wallet_updated_at;
if (!unchanged) blockers.push("READ_ONLY_VERIFY_V2_CHANGED_STATE");

const decision = blockers.length ? "REPAIR_SHOT_ISOLATION_GATE_V2_VERIFICATION_BLOCKED" : "REPAIR_SHOT_ISOLATION_GATE_V2_18_REPLACEMENTS_CONFIRMED";
const readiness = blockers.length ? "REPAIR_SHOT_ISOLATION_GATE_V2_VERIFICATION_BLOCKED" : "READY_TO_RESUME_CHECKPOINTED_REPAIR_SOURCE_DISPATCH";
const report = { contract:REPORT_CONTRACT, generated_at:new Date().toISOString(), organization_id:organizationId, creative_project_id:projectId, production_graph_id:graphId, alias_audit_file:aliasFile.absolute, alias_audit_file_sha256:aliasFile.file_sha256, boundary_audit_file:boundaryFile.absolute, boundary_audit_file_sha256:boundaryFile.file_sha256, checkpoint_file:checkpointFile.absolute, checkpoint_file_sha256:checkpointFile.file_sha256, replacement_task_count:replacements.length, source_passed_count:sourcePassedCount, review_passed_count:reviewPassedCount, failed_count:failedCount, verifications, protected_task_count:protectedIds.size, protected_task_state_sha256:protectedStateSha, blockers, decision, exact_state_before:before, exact_state_after:after, state_unchanged:unchanged, database_writes_executed:false, wallet_reservations_executed:false, provider_calls_executed:false, provider_polls_executed:false, review_execution_executed:false, finalisation_executed:false, publication_executed:false, readiness };
writeJson(outputPath, report);

console.log("============================================================");
console.log("READ-ONLY MATERIALIZATION-BOUNDARY-AWARE ISOLATION VERIFY");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`TASK_COUNT=${before.task_count}`);
console.log(`REPLACEMENT_TASK_COUNT=${replacements.length}`);
console.log(`SOURCE_PASSED_COUNT=${sourcePassedCount}`);
console.log(`REVIEW_PASSED_COUNT=${reviewPassedCount}`);
console.log(`FAILED_COUNT=${failedCount}`);
console.log(`PROTECTED_TASK_COUNT=${protectedIds.size}`);
console.log(`PROTECTED_TASK_STATE_SHA256=${protectedStateSha}`);
for (const item of verifications) console.log(`SHOT_ISOLATION_V2=${item.task_id}|kind=${item.kind}|contract=${item.materialization_contract_verified?"PASS":"FAIL"}|graph_alias=${item.graph_alias_verified?"PASS":"FAIL"}|asset_node_refs=${item.input_asset_node_reference_count}|node_refs=${item.input_production_node_reference_count}|active_alias_refs=${item.active_repair_alias_reference_count}|graph_alias_evidence=${item.graph_repair_alias_evidence_count}|issues=${item.issues.join(",")}|passed=${item.passed?"YES":"NO"}`);
console.log(`SHOT_ISOLATION_V2_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`SHOT_ISOLATION_V2_DECISION=${decision}`);
console.log(`TASK_STATE_SHA256_BEFORE=${before.task_state_sha256}`);
console.log(`TASK_STATE_SHA256_AFTER=${after.task_state_sha256}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
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
if (blockers.length || !unchanged) process.exitCode=2;
