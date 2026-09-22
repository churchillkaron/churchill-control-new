import {
  CODE_AI_ENGINEERING_PRECISION_CONTRACT,
  buildCodeAISemanticFileIndex,
  deriveCodeAIContextPacket,
  deriveCodeAIWatchdog,
  fingerprintCodeAIEnvironment,
  minimizeCodeAIPatchPlan,
  summarizeCodeAIEngineeringPrecision,
} from "./CodeAIEngineeringPrecisionRuntime.js";

export const CODE_AI_ENGINEERING_PRECISION_OS_CONTRACT = "AVANTIQO_CODE_AI_ENGINEERING_PRECISION_OS_V1";

function text(v,n=6000){return String(v??"").trim().slice(0,n)}
function list(v){return Array.isArray(v)?v:[]}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
function unique(v){return [...new Set(list(v).map(x=>text(x,1200)).filter(Boolean))]}
const DEFECT=/\b(fix|bug|broken|error|failure|regression|wrong|issue|incident|repair|debug)\b/i;
const UI=/\b(ui|ux|page|screen|form|button|layout|browser|frontend|mobile|responsive|visual|accessibility)\b/i;
const SECURITY=/\b(auth|permission|security|secret|token|tenant|rls|payment|wallet|bank|invoice|customer data|pii)\b/i;
const PERFORMANCE=/\b(performance|latency|slow|slower|fast|faster|speed|memory|cpu|bundle|throughput|load time)\b/i;
const RUNTIME=/\b(api|runtime|production|server|worker|queue|webhook|integration|network|log|trace|telemetry|incident)\b/i;
const RELEASE=/\b(deploy|release|production|go live|rollout|canary|staging|preview)\b/i;
const BROAD=/\b(world.?class|release ready|production ready|end[- ]to[- ]end|entire|whole|full audit|all capabilities|platform)\b/i;
const DATA=/\b(database|postgres|supabase|sql|schema|migration|table|rpc|rls|inventory|finance|invoice|booking|wallet)\b/i;

function classify({objective,state={}}={}){
 const paths=unique([...(state.files_changed||[]),...list(state.source_changes).map(x=>x?.path)]);const source=`${text(objective,12000)}\n${paths.join("\n")}`;
 const ts=paths.some(p=>/\.(ts|tsx|mts|cts)$/.test(p)); const defect=DEFECT.test(source); const ui=UI.test(source)||paths.some(p=>/\.(jsx|tsx|css|scss)$/.test(p)); const security=SECURITY.test(source); const performance=PERFORMANCE.test(source); const runtime=RUNTIME.test(source); const release=RELEASE.test(source); const broad=BROAD.test(source); const data=DATA.test(source)||paths.some(p=>/\.sql$|supabase\/migrations/i.test(p));
 return {typescript:ts,defect,ui,security,performance,runtime,release,broad,data,changed_paths:paths,high_risk:security||data||release};
}

function items(c){return [
{id:1,key:"compiler_semantics",name:"Compiler/LSP semantic repository intelligence",required:c.typescript},
{id:2,key:"incremental_semantic_index",name:"Incremental semantic repository index",required:c.typescript},
{id:3,key:"test_impact",name:"Deterministic test-impact selection",required:true},
{id:4,key:"coverage_guidance",name:"Coverage-guided verification",required:c.defect||c.high_risk},
{id:5,key:"mutation_testing",name:"Mutation testing",required:c.defect||c.high_risk},
{id:6,key:"property_fuzz",name:"Property-based and fuzz testing",required:c.high_risk},
{id:7,key:"git_history",name:"Git-history intelligence",required:c.defect},
{id:8,key:"regression_archaeology",name:"Regression archaeology",required:c.defect},
{id:9,key:"flaky_intelligence",name:"Flaky-test intelligence",required:true},
{id:10,key:"environment_fingerprint",name:"Hermetic environment fingerprint",required:true},
{id:11,key:"supply_chain",name:"Dependency and supply-chain security",required:c.security||c.release},
{id:12,key:"taint_dataflow",name:"Static taint/dataflow analysis",required:c.security},
{id:13,key:"patch_minimization",name:"Patch minimization and delta debugging",required:true},
{id:14,key:"uncertainty",name:"Contradiction and uncertainty engine",required:true},
{id:15,key:"tool_cache",name:"Deterministic tool-result cache",required:true},
{id:16,key:"context_compiler",name:"Context compiler",required:true},
{id:17,key:"context_compression",name:"Durable context compression",required:true},
{id:18,key:"watchdog",name:"Deadlock and liveness watchdog",required:true},
{id:19,key:"failure_injection",name:"Failure-injection testing",required:c.runtime||c.high_risk},
{id:20,key:"concurrency_lab",name:"Concurrency and race-condition laboratory",required:c.data||c.runtime},
{id:21,key:"staging_canary",name:"Staging and canary verification",required:c.release},
{id:22,key:"progressive_rollback",name:"Progressive rollout and automatic rollback plan",required:c.release},
{id:23,key:"business_invariants",name:"Executable business invariant testing",required:c.data||c.broad},
{id:24,key:"shadow_verification",name:"Production-shadow verification",required:c.release},
{id:25,key:"user_flow_replay",name:"Real user-flow replay",required:c.ui||c.release},
{id:26,key:"visual_regression",name:"Visual regression engine",required:c.ui},
{id:27,key:"accessibility",name:"Accessibility engineering",required:c.ui},
{id:28,key:"review_comments",name:"Autonomous line-level code review",required:c.high_risk||c.broad},
{id:29,key:"reviewer_calibration",name:"Reviewer calibration",required:c.high_risk||c.broad},
{id:30,key:"self_improvement_benchmark",name:"Self-improvement benchmark loop",required:c.broad},
{id:31,key:"local_specialization",name:"Local-model specialization",required:false},
{id:32,key:"repository_specialist",name:"Repository-specific engineering model",required:false},
{id:33,key:"throughput_scheduler",name:"Agent throughput scheduler",required:true},
{id:34,key:"compute_economics",name:"Compute economics per verified task",required:true},
{id:35,key:"comparative_benchmark",name:"Controlled better-than-agent benchmark harness",required:c.broad},
];}

function evidenceMap(state={}){return object(state.precision_evidence)}
function evidenceSatisfied(key,e){const v=object(e?.[key]); if(!Object.keys(v).length)return false; if(v.passed===false||v.verified===false||v.complete===false)return false; return v.recorded===true||v.passed===true||v.verified===true||v.complete===true||Boolean(v.contract);}

export function prepareCodeAIEngineeringPrecisionOS({objective,state={},objective_context={}}={}){
 const c=classify({objective,state}); const requirements=items(c); const prior=object(state.precision_control);
 const environment=fingerprintCodeAIEnvironment({lockfile:text(objective_context.lockfile_hash_source,10000),packageJson:text(objective_context.package_json_hash_source,10000),schemaVersion:objective_context.schema_version,browserVersion:objective_context.browser_version,tools:object(objective_context.tool_versions)});
 const contextPacket=deriveCodeAIContextPacket({objective,affectedSymbols:list(prior.affected_symbols),facts:list(state.evidence).filter(x=>x?.kind!=="autonomous_planner"),failures:state.failures,memory:list(state.verified_engineering_memory?.items),nextDecision:"Satisfy the next required precision capability with deterministic evidence."});
 const watchdog=deriveCodeAIWatchdog({events:state.evidence,pendingSince:state.planner_pending?.created_at});
 const patchPlan=minimizeCodeAIPatchPlan({changes:state.source_changes,verifiedRequiredPaths:list(state.files_changed)});
 const summary=summarizeCodeAIEngineeringPrecision({input:{classification:c}});
 const required=requirements.filter(x=>x.required).map(x=>`${x.id}.${x.name}`).join(" | ");
 const directive=[
  "AVANTIQO ENGINEERING PRECISION OS V1",
  `REQUIRED PRECISION CAPABILITIES: ${required}`,
  "TOP-FIVE A-E ARE MANDATORY IMPLEMENTATION PRIORITIES WHEN APPLICABLE: A compiler/LSP semantic brain; B test-impact+coverage+mutation; C git-history/regression archaeology; D context compiler+deterministic cache; E staging/canary/shadow verification+rollback.",
  "Use precision evidence, not confidence, to satisfy a required capability. Missing optional engines must be marked unavailable; never fabricate scanner, coverage, mutation, fuzz, staging, shadow or rollout evidence.",
  "Compiler semantics must use the local TypeScript engine for TS/TSX when available. Test selection must be traceable to changed symbols or conservative all-tests fallback.",
  "Security/release work requires supply-chain evidence; sensitive input-to-sink signals require deeper review. Release work must pass preview/staging/shadow/canary gates before production eligibility.",
  "Keep raw chain-of-thought private. Persist only facts, decisions, evidence, metrics and bounded hypotheses.",
 ].join("\n");
 return {control:{contract:CODE_AI_ENGINEERING_PRECISION_OS_CONTRACT,precision_contract:CODE_AI_ENGINEERING_PRECISION_CONTRACT,classification:c,requirements,top_five:{A:"compiler_semantics",B:["test_impact","coverage_guidance","mutation_testing"],C:["git_history","regression_archaeology"],D:["context_compiler","tool_cache"],E:["staging_canary","shadow_verification","progressive_rollback"]},environment_fingerprint:environment,context_packet:contextPacket,watchdog,patch_minimization:patchPlan,summary,authority:{mutation:false,commit:false,deploy:false}},directive,objective_context:{...object(objective_context),engineering_precision_os_contract:CODE_AI_ENGINEERING_PRECISION_OS_CONTRACT,environment_fingerprint:environment.fingerprint}};
}

export function finalizeCodeAIEngineeringPrecisionOS({prepared_control={},result={}}={}){
 const state=object(result.state||result);const c=Object.keys(object(prepared_control.classification)).length?prepared_control.classification:classify({objective:state.objective,state});const requirements=list(prepared_control.requirements).length?prepared_control.requirements:items(c);const e=evidenceMap(state);
 const alwaysSystemSatisfied=new Set(["incremental_semantic_index","flaky_intelligence","tool_cache","context_compiler","context_compression","watchdog","throughput_scheduler","compute_economics"]);
 const readiness=requirements.map(item=>({...item,satisfied:!item.required||evidenceSatisfied(item.key,e)||alwaysSystemSatisfied.has(item.key)}));
 const missing=readiness.filter(x=>x.required&&!x.satisfied);
 return {...object(prepared_control),contract:CODE_AI_ENGINEERING_PRECISION_OS_CONTRACT,readiness,missing_required_precision:missing.map(x=>({id:x.id,key:x.key,name:x.name})),required_count:readiness.filter(x=>x.required).length,satisfied_required_count:readiness.filter(x=>x.required&&x.satisfied).length,precision_ready:missing.length===0,authority:{mutation:false,commit:false,deploy:false},finalized_at:new Date().toISOString()};
}

export function assertCodeAIEngineeringPrecisionCommitReady(state={}){
 const p=object(state.engineering_precision_os);if(!Object.keys(p).length)return true;if(text(p.contract,180)!==CODE_AI_ENGINEERING_PRECISION_OS_CONTRACT)throw new Error("CODE_AI_ENGINEERING_PRECISION_OS_CONTRACT_INVALID");if(p.precision_ready!==true){const missing=list(p.missing_required_precision).map(x=>text(x?.key,120)).filter(Boolean);const err=new Error(`CODE_AI_ENGINEERING_PRECISION_REQUIRED_PROOF_MISSING${missing.length?`:${missing.join(",")}`:""}`);err.missing_required_precision=missing;throw err}return true;
}

export function semanticIndexFromEvidenceFiles(state={}){
 return list(state.evidence).filter(x=>x?.action==="read"&&x?.result?.file_path&&x?.result?.content).slice(-12).map(x=>buildCodeAISemanticFileIndex({filePath:x.result.file_path,content:x.result.content}));
}

export default Object.freeze({contract:CODE_AI_ENGINEERING_PRECISION_OS_CONTRACT,prepare:prepareCodeAIEngineeringPrecisionOS,finalize:finalizeCodeAIEngineeringPrecisionOS,assertCommitReady:assertCodeAIEngineeringPrecisionCommitReady,assertReviewReady:assertCodeAIEngineeringPrecisionReviewReady,assertProductionReleaseReady:assertCodeAIProductionReleasePrecisionReady,semanticIndexFromEvidenceFiles});

export function assertCodeAIProductionReleasePrecisionReady(state = {}) {
  const precision = object(state.engineering_precision_os);
  if (!Object.keys(precision).length) return true;
  const evidence = evidenceMap(state);
  const required = [
    "staging_canary",
    "progressive_rollback",
    "business_invariants",
    "shadow_verification",
  ];
  const changed = unique(state.files_changed);
  const uiAffected = changed.some((filePath) => /(^|\/)(app|pages|components|src\/app)\//i.test(filePath) || /\.(jsx|tsx|css|scss)$/i.test(filePath));
  if (uiAffected) required.push("user_flow_replay", "visual_regression", "accessibility");
  const missing = required.filter((key) => !evidenceSatisfied(key, evidence));
  if (missing.length) {
    const error = new Error(`CODE_AI_PRODUCTION_RELEASE_PRECISION_PROOF_MISSING:${missing.join(",")}`);
    error.missing_release_precision = missing;
    throw error;
  }
  return true;
}

export function assertCodeAIEngineeringPrecisionReviewReady(state = {}) {
  const precision = object(state.engineering_precision_os);
  if (!Object.keys(precision).length) return true;
  if (text(precision.contract, 180) !== CODE_AI_ENGINEERING_PRECISION_OS_CONTRACT) {
    throw new Error("CODE_AI_ENGINEERING_PRECISION_OS_CONTRACT_INVALID");
  }
  const deferred = new Set([
    "staging_canary",
    "progressive_rollback",
    "shadow_verification",
    "user_flow_replay",
    "visual_regression",
    "accessibility",
  ]);
  const missing = list(precision.missing_required_precision)
    .map((item) => text(item?.key, 120))
    .filter((key) => key && !deferred.has(key));
  if (missing.length) {
    const error = new Error(`CODE_AI_ENGINEERING_PRECISION_REVIEW_PROOF_MISSING:${missing.join(",")}`);
    error.missing_review_precision = missing;
    throw error;
  }
  return true;
}
