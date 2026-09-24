import crypto from "node:crypto";
import path from "node:path";
import ts from "typescript";

export const CODE_AI_ENGINEERING_PRECISION_CONTRACT = "AVANTIQO_CODE_AI_ENGINEERING_PRECISION_V1";

function text(v,n=4000){return String(v??"").trim().slice(0,n)}
function list(v){return Array.isArray(v)?v:[]}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
function unique(v){return [...new Set(list(v).map(x=>text(x,2000)).filter(Boolean))]}
function sha(v){return crypto.createHash("sha256").update(String(v??"")).digest("hex")}
function now(){return new Date().toISOString()}

export function buildCodeAISemanticFileIndex({filePath,content}={}){
  const source=text(content,2_000_000); const name=text(filePath,2000)||"file.ts";
  const kind=/\.tsx$/i.test(name)?ts.ScriptKind.TSX:/\.jsx$/i.test(name)?ts.ScriptKind.JSX:/\.js$/i.test(name)?ts.ScriptKind.JS:ts.ScriptKind.TS;
  const sf=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,kind);
  const symbols=[]; const imports=[]; const exports=[]; const calls=[]; const identifiers=new Map();
  function pushSymbol(node,kindName){
    const n=node.name&&ts.isIdentifier(node.name)?node.name.text:null; if(!n)return;
    symbols.push({name:n,kind:kindName,start:sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1,exported:node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)===true});
  }
  function visit(node){
    if(ts.isFunctionDeclaration(node))pushSymbol(node,"function");
    else if(ts.isClassDeclaration(node))pushSymbol(node,"class");
    else if(ts.isInterfaceDeclaration(node))pushSymbol(node,"interface");
    else if(ts.isTypeAliasDeclaration(node))pushSymbol(node,"type");
    else if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name))pushSymbol(node,"variable");
    if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier))imports.push(node.moduleSpecifier.text);
    if(ts.isExportDeclaration(node)&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))exports.push({source:node.moduleSpecifier.text});
    if(ts.isCallExpression(node)){const expr=node.expression; const callee=ts.isIdentifier(expr)?expr.text:ts.isPropertyAccessExpression(expr)?expr.name.text:null;if(callee)calls.push({callee,argument_count:node.arguments.length,line:sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1});}
    if(ts.isIdentifier(node)){const a=identifiers.get(node.text)||{name:node.text,count:0,lines:[]};a.count+=1;if(a.lines.length<12)a.lines.push(sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1);identifiers.set(node.text,a)}
    ts.forEachChild(node,visit);
  }
  visit(sf);
  const diagnostics=[...sf.parseDiagnostics].map(d=>({code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText," "),line:d.start==null?null:sf.getLineAndCharacterOfPosition(d.start).line+1}));
  return {contract:"AVANTIQO_CODE_SEMANTIC_FILE_INDEX_V1",file_path:name,source_hash:sha(source),language:ts.ScriptKind[kind],symbols:symbols.slice(0,400),imports:unique(imports).slice(0,200),exports:exports.slice(0,200),calls:calls.slice(0,400),identifier_references:[...identifiers.values()].filter(x=>x.count>1).sort((a,b)=>b.count-a.count).slice(0,400),parse_diagnostics:diagnostics.slice(0,80),compiler_grade_parser:true};
}

export function updateCodeAISemanticRepositoryIndex({previous={},files=[],changedPaths=[]}={}){
  const prior=object(previous); const changed=new Set(unique(changedPaths)); const byPath=new Map(list(prior.files).map((entry)=>[text(entry?.file_path,2000),entry]));
  for(const file of list(files)){const filePath=text(file?.path||file?.file_path,2000);if(!filePath)continue;if(changed.size&&!changed.has(filePath)&&byPath.has(filePath))continue;byPath.set(filePath,buildCodeAISemanticFileIndex({filePath,content:file?.content}))}
  const indexed=[...byPath.values()].filter(Boolean).slice(0,5000); const symbolToFiles={}; for(const file of indexed){for(const symbol of list(file.symbols)){const name=text(symbol?.name,240);if(!name)continue;(symbolToFiles[name]??=[]).push(file.file_path)}}
  const result={contract:"AVANTIQO_CODE_INCREMENTAL_SEMANTIC_INDEX_V1",files:indexed,symbol_to_files:symbolToFiles,file_count:indexed.length,incremental:true,changed_paths:[...changed],index_hash:sha(JSON.stringify(indexed.map(x=>[x.file_path,x.source_hash])))}; return result;
}

export function deriveCodeAITestImpact({changedSymbols=[],semanticFiles=[],tests=[]}={}){
  const changed=new Set(unique(changedSymbols)); const impacted=[];
  for(const t of list(tests)){
    const body=text(t.content,500000); const refs=unique([...body.matchAll(/\b[A-Za-z_$][\w$]*\b/g)].map(m=>m[0])); const matched=refs.filter(r=>changed.has(r));
    if(matched.length)impacted.push({test_path:text(t.path,1200),matched_symbols:matched.slice(0,30),score:matched.length});
  }
  return {contract:"AVANTIQO_CODE_TEST_IMPACT_V1",changed_symbols:[...changed],impacted_tests:impacted.sort((a,b)=>b.score-a.score),all_tests_required:impacted.length===0&&changed.size>0,semantic_file_count:list(semanticFiles).length};
}

export function deriveCodeAICoverageObligations({changedLines=[],coverage={}}={}){
  const uncovered=[]; const covered=[]; const byFile=object(coverage);
  for(const item of list(changedLines)){const file=text(item?.file,1200);const line=Number(item?.line);if(!file||!Number.isInteger(line))continue;const hit=Number(byFile?.[file]?.[line]??0)>0;(hit?covered:uncovered).push({file,line})}
  return {contract:"AVANTIQO_CODE_COVERAGE_GUIDANCE_V1",changed_line_count:covered.length+uncovered.length,covered_changed_lines:covered,uncovered_changed_lines:uncovered,changed_line_coverage:covered.length+uncovered.length?Number((covered.length/(covered.length+uncovered.length)).toFixed(4)):null,complete:uncovered.length===0};
}

export function generateCodeAIMutants({filePath,content,limit=16}={}){
  const src=String(content??""); const mutants=[]; const add=(kind,search,replacement)=>{const i=src.indexOf(search);if(i<0||mutants.length>=limit)return;mutants.push({id:`M${mutants.length+1}`,kind,file_path:text(filePath,1200),original:search,replacement,content:src.slice(0,i)+replacement+src.slice(i+search.length)})};
  for(const [a,b] of [[" === "," !== "],[" !== "," === "],[" >= "," < "],[" <= "," > "],[" > "," <= "],[" < "," >= "],["true","false"],["false","true"]])add("operator_flip",a,b);
  for(const m of src.matchAll(/if\s*\(([^\n]{1,160})\)/g)){if(mutants.length>=limit)break;const original=m[0];const replacement=`if (!(${m[1]}))`;add("condition_negation",original,replacement)}
  return {contract:"AVANTIQO_CODE_MUTATION_TEST_PLAN_V1",file_path:text(filePath,1200),source_hash:sha(src),mutants,mutant_count:mutants.length,tests_must_kill_mutants:true};
}

export function generateCodeAIFuzzCases({schema={},limit=40}={}){
  const fields=object(schema.properties); const cases=[]; const base={};
  for(const [k,v] of Object.entries(fields)){if(v?.type==="string")base[k]="valid";else if(v?.type==="number"||v?.type==="integer")base[k]=1;else if(v?.type==="boolean")base[k]=true;else if(v?.type==="array")base[k]=[];else base[k]=null}
  cases.push({id:"baseline",input:base,kind:"baseline"});
  for(const [k,v] of Object.entries(fields)){if(cases.length>=limit)break;const variants=v?.type==="string"?["", " ", "\u0000", "💥", "x".repeat(4096)]:v?.type==="number"||v?.type==="integer"?[0,-1,Number.MAX_SAFE_INTEGER,Number.NaN]:v?.type==="array"?[[],Array(1000).fill(null)]:[null];for(const val of variants){if(cases.length>=limit)break;cases.push({id:`${k}-${cases.length}`,kind:"boundary",field:k,input:{...base,[k]:val}})}}
  return {contract:"AVANTIQO_CODE_FUZZ_CASES_V1",case_count:cases.length,cases};
}

export function fingerprintCodeAIEnvironment({nodeVersion=process.version,platform=process.platform,arch=process.arch,lockfile="",packageJson="",schemaVersion=null,browserVersion=null,tools={}}={}){
  const result={contract:"AVANTIQO_CODE_ENVIRONMENT_FINGERPRINT_V1",node_version:text(nodeVersion,80),platform:text(platform,80),arch:text(arch,80),lockfile_sha256:sha(lockfile),package_json_sha256:sha(packageJson),schema_version:text(schemaVersion,160)||null,browser_version:text(browserVersion,160)||null,tools:object(tools)}; return {...result,fingerprint:sha(JSON.stringify(result))};
}

export function scanCodeAISupplyChain({lockfile="",sourceFiles=[]}={}){
  const findings=[]; const lock=String(lockfile??"");
  if(/"resolved"\s*:\s*"(?:git\+|git:|github:|http:)/i.test(lock))findings.push({severity:"high",kind:"non_registry_dependency"});
  if(/"hasInstallScript"\s*:\s*true/i.test(lock))findings.push({severity:"medium",kind:"install_script_dependency"});
  const secretPatterns=[[/AKIA[0-9A-Z]{16}/g,"aws_access_key"],[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,"private_key"],[/(?:sk|rk)-[A-Za-z0-9_-]{24,}/g,"secret_token"]];
  for(const f of list(sourceFiles)){const body=String(f?.content??"");for(const [re,kind] of secretPatterns){if(re.test(body))findings.push({severity:"critical",kind,file_path:text(f?.path,1200)})}}
  return {contract:"AVANTIQO_CODE_SUPPLY_CHAIN_SCAN_V1",findings,critical_count:findings.filter(x=>x.severity==="critical").length,high_count:findings.filter(x=>x.severity==="high").length,passed:!findings.some(x=>["critical","high"].includes(x.severity))};
}

export function deriveCodeAITaintSignals({filePath,content}={}){
  const src=String(content??""); const sources=[...src.matchAll(/\b(req(?:uest)?\.(?:body|query|params)|searchParams|formData|process\.env)\b/g)].map(m=>({token:m[1],index:m.index})); const sinks=[...src.matchAll(/\b(eval\s*\(|exec\s*\(|spawn\s*\(|\.query\s*\(|fetch\s*\(|console\.(?:log|error)\s*\()/g)].map(m=>({token:m[1],index:m.index})); const signals=[];for(const a of sources){for(const b of sinks){if(b.index>a.index&&b.index-a.index<5000)signals.push({source:a.token,sink:b.token,distance:b.index-a.index})}}
  return {contract:"AVANTIQO_CODE_TAINT_SIGNAL_V1",file_path:text(filePath,1200),signals:signals.slice(0,80),requires_human_or_deeper_dataflow_review:signals.length>0};
}

export function minimizeCodeAIPatchPlan({changes=[],verifiedRequiredPaths=[]}={}){
  const required=new Set(unique(verifiedRequiredPaths)); const removable=list(changes).filter(c=>!required.has(text(c?.path,1200))).map(c=>text(c?.path,1200)).filter(Boolean); return {contract:"AVANTIQO_CODE_PATCH_MINIMIZATION_V1",required_paths:[...required],candidate_removable_paths:removable,verification_required_after_each_removal:true,automatic_removal_authority:false};
}

export function calibrateCodeAIUncertainty({facts=[],hypotheses=[],contradictions=[]}={}){
  const f=list(facts).filter(x=>x?.verified===true).length; const h=list(hypotheses).length; const c=list(contradictions).length; const score=Math.max(0,Math.min(1,(f+1)/(f+h+c+1))); return {contract:"AVANTIQO_CODE_UNCERTAINTY_V1",verified_fact_count:f,hypothesis_count:h,contradiction_count:c,confidence:Number(score.toFixed(4)),state:c?"CONTRADICTED":h>f?"UNCERTAIN":"EVIDENCE_BACKED",completion_allowed:c===0&&h<=f};
}

export function deriveCodeAIFlakyTestProfile({runs=[]}={}){
  const groups=new Map(); for(const r of list(runs)){const k=text(r?.test,1200);if(!k)continue;const g=groups.get(k)||[];g.push(r?.passed===true);groups.set(k,g)} const tests=[...groups].map(([test,vals])=>{const pass=vals.filter(Boolean).length;const rate=pass/vals.length;return{test,runs:vals.length,pass_rate:Number(rate.toFixed(4)),flaky:pass>0&&pass<vals.length}}); return {contract:"AVANTIQO_CODE_FLAKY_TEST_PROFILE_V1",tests,flaky_tests:tests.filter(x=>x.flaky),quarantine_auto_certification_allowed:false};
}

export function deriveCodeAIContextPacket({objective,affectedSymbols=[],facts=[],failures=[],memory=[],nextDecision=null,maxChars=16000}={}){
  const packet={contract:"AVANTIQO_CODE_CONTEXT_COMPILER_V1",objective:text(objective,5000),affected_symbols:unique(affectedSymbols).slice(0,80),verified_facts:list(facts).filter(x=>x?.verified!==false).slice(-40),failures:list(failures).slice(-20),relevant_memory:list(memory).slice(-12),next_decision:text(nextDecision,2000)||null}; let serialized=JSON.stringify(packet); if(serialized.length>maxChars){packet.relevant_memory=packet.relevant_memory.slice(-4);packet.failures=packet.failures.slice(-8);packet.verified_facts=packet.verified_facts.slice(-16);serialized=JSON.stringify(packet)} return {...packet,serialized_chars:serialized.length,raw_chain_of_thought_included:false};
}

const CACHE=new Map();
export async function cachedCodeAIToolResult({key,head,environmentFingerprint,ttlMs=300000,loader}={}){
  const cacheKey=sha(`${text(head,160)}|${text(environmentFingerprint,160)}|${text(key,2000)}`);const prior=CACHE.get(cacheKey);if(prior&&Date.now()-prior.at<ttlMs)return{...prior.value,cache_hit:true};if(typeof loader!=="function")throw new Error("CODE_AI_TOOL_CACHE_LOADER_REQUIRED");const value=await loader();CACHE.set(cacheKey,{at:Date.now(),value});if(CACHE.size>256)CACHE.delete(CACHE.keys().next().value);return{...object(value),cache_hit:false,cache_key:cacheKey};
}

export function compressCodeAIMissionContext({events=[],facts=[],failures=[],decisions=[],maxItems=80}={}){
  const verified=list(facts).filter((item)=>item?.verified!==false).slice(-Math.floor(maxItems/2));
  const compactEvents=list(events).filter((entry)=>!["autonomous_planner_pending","heartbeat"].includes(text(entry?.kind,120))).slice(-Math.floor(maxItems/3)).map((entry)=>({at:entry?.at||null,kind:text(entry?.kind,120)||null,action:text(entry?.action,120)||null,status:text(entry?.status,120)||null,operation_id:text(entry?.operation_id,200)||null}));
  return {contract:"AVANTIQO_CODE_CONTEXT_COMPRESSION_V1",verified_facts:verified,events:compactEvents,failures:list(failures).slice(-12),decisions:list(decisions).slice(-12),raw_evidence_retained_by_reference:true,raw_chain_of_thought_included:false,compressed:true};
}

export function deriveCodeAIWatchdog({events=[],pendingSince=null,nowMs=Date.now()}={}){
  const recent=list(events).slice(-12);const fingerprints=recent.map(e=>sha(JSON.stringify([e?.action,e?.description,e?.input])));
  const repeated=fingerprints.length>=4&&new Set(fingerprints.slice(-4)).size===1;
  const pendingAge=pendingSince?Math.max(0,nowMs-Date.parse(pendingSince)):0;
  const interactivePendingDeadlineMs=120000;
  const stale=pendingAge>interactivePendingDeadlineMs;
  return{contract:"AVANTIQO_CODE_WATCHDOG_V2",repeated_no_progress:repeated,pending_age_ms:pendingAge,pending_deadline_ms:interactivePendingDeadlineMs,stale_pending:stale,recovery_required:repeated||stale,recovery_action:stale?"REACQUIRE_OR_RESUME":repeated?"REPLAN_WITH_NEW_EVIDENCE":"NONE"};
}

export function deriveCodeAIFailureInjectionPlan({surfaces=[]}={}){
  const modes=["database_unavailable","network_timeout","duplicate_request","worker_crash","device_disconnect","stale_read","provider_timeout"];return{contract:"AVANTIQO_CODE_FAILURE_INJECTION_V1",experiments:modes.filter((_,i)=>i<Math.max(1,Math.min(modes.length,list(surfaces).length||modes.length))).map((mode,i)=>({id:`F${i+1}`,mode,mutation_authority:false,production_allowed:false})),production_execution_allowed:false};
}

export function deriveCodeAIConcurrencyPlan({operations=[]}={}){
  const ops=unique(operations);return{contract:"AVANTIQO_CODE_CONCURRENCY_LAB_V1",scenarios:ops.flatMap(op=>[{operation:op,kind:"duplicate_submission"},{operation:op,kind:"simultaneous_write"},{operation:op,kind:"stale_version_write"}]).slice(0,30),exactly_once_or_idempotency_proof_required:true,production_execution_allowed:false};
}

export function deriveCodeAIReleasePipeline({risk="standard",hasDatabaseChange=false}={}){
  const stages=["SOURCE_VERIFIED","REVIEW_PR","PREVIEW_DEPLOY","SMOKE_TEST","BROWSER_API_TEST","SHADOW_COMPARE","CANARY_5_PERCENT","CANARY_25_PERCENT","PRODUCTION_100_PERCENT","POST_RELEASE_OBSERVE"];return{contract:"AVANTIQO_CODE_PROGRESSIVE_RELEASE_V1",risk:text(risk,80),stages,rollback_on_regression:true,database_change:hasDatabaseChange,automatic_production_authority:false,required_health_signals:["error_rate","latency","business_invariants"]};
}

export function deriveCodeAIBusinessInvariantSuite({domain,entities=[]}={}){
  const shared=["organization_isolation","idempotent_mutation","auditability"];const d=text(domain,120).toLowerCase();const domainRules=d.includes("finance")?["journal_balances","invoice_totals_reconcile","paid_state_monotonic"]:d.includes("supply")?["inventory_no_silent_duplicate","stock_never_unexplained_negative","cost_recalculation_consistent"]:d.includes("booking")?["capacity_not_overbooked","payment_booking_link_consistent"]:[];return{contract:"AVANTIQO_CODE_BUSINESS_INVARIANT_SUITE_V1",domain:d||"general",invariants:unique([...shared,...domainRules,...list(entities).map(x=>`entity_scope:${text(x,160)}`)]),must_pass_before_release:true};
}

export function deriveCodeAIShadowComparison({baseline=[],candidate=[]}={}){
  const b=new Map(list(baseline).map(x=>[text(x?.id,240),x]));const diffs=[];for(const c of list(candidate)){const id=text(c?.id,240);const old=b.get(id);if(!old)continue;const a=JSON.stringify(old?.response);const n=JSON.stringify(c?.response);if(a!==n)diffs.push({id,baseline_hash:sha(a),candidate_hash:sha(n),expected:c?.expected_change===true})}return{contract:"AVANTIQO_CODE_SHADOW_COMPARE_V1",compared:list(candidate).length,differences:diffs,unexpected_differences:diffs.filter(x=>!x.expected),passed:diffs.every(x=>x.expected)};
}

export function deriveCodeAIUserFlowReplay({flow=[],results=[]}={}){
  const expected=list(flow).map((step,index)=>({id:text(step?.id,160)||`S${index+1}`,action:text(step?.action,240),target:text(step?.target,1000),assertion:text(step?.assertion,1200)})); const actual=new Map(list(results).map(r=>[text(r?.id,160),r])); const steps=expected.map(step=>({...step,passed:actual.get(step.id)?.passed===true,evidence_ref:text(actual.get(step.id)?.evidence_ref,1200)||null})); return {contract:"AVANTIQO_CODE_USER_FLOW_REPLAY_V1",steps,passed:steps.length>0&&steps.every(x=>x.passed),production_mutation_allowed:false};
}

export function deriveCodeAIReviewComments({findings=[]}={}){
  const comments=list(findings).map((f,index)=>({id:text(f?.id,160)||`R${index+1}`,path:text(f?.path,1200),line:Number.isInteger(Number(f?.line))?Number(f.line):null,severity:text(f?.severity,80).toLowerCase()||"advisory",body:text(f?.body,4000),blocking:f?.blocking===true,evidence_refs:unique(f?.evidence_refs).slice(0,12)})).filter(c=>c.path&&c.line>0&&c.body); return {contract:"AVANTIQO_CODE_REVIEW_COMMENTS_V1",comments,blocking_count:comments.filter(c=>c.blocking).length,line_level:true,automatic_merge_authority:false};
}

export function deriveCodeAIVisualRegression({baseline={},candidate={},threshold=0.01}={}){
  const delta=Number(candidate?.difference_ratio??1);return{contract:"AVANTIQO_CODE_VISUAL_REGRESSION_V1",baseline_hash:text(baseline?.hash,160)||null,candidate_hash:text(candidate?.hash,160)||null,difference_ratio:delta,threshold,passed:Number.isFinite(delta)&&delta<=threshold,viewports:unique(candidate?.viewports||[])};
}

export function deriveCodeAIAccessibilityGate({violations=[]}={}){
  const critical=list(violations).filter(v=>["critical","serious"].includes(text(v?.impact,80).toLowerCase()));return{contract:"AVANTIQO_CODE_ACCESSIBILITY_V1",violation_count:list(violations).length,blocking_violation_count:critical.length,passed:critical.length===0,keyboard_navigation_required:true,labels_required:true,contrast_required:true};
}

export function deriveCodeAIReviewCalibration({reviews=[]}={}){
  const by=new Map();for(const r of list(reviews)){const id=text(r?.reviewer,160);if(!id)continue;const x=by.get(id)||{reviewer:id,valid:0,false_positive:0,escaped:0};if(r?.validated===true)x.valid++;if(r?.false_positive===true)x.false_positive++;if(r?.escaped===true)x.escaped++;by.set(id,x)}const reviewers=[...by.values()].map(x=>({...x,weight:Number(((x.valid+1)/(x.valid+x.false_positive+x.escaped+2)).toFixed(4))}));return{contract:"AVANTIQO_CODE_REVIEWER_CALIBRATION_V1",reviewers,automatic_authority_increase:false};
}

export function deriveCodeAISelfImprovementDecision({baseline={},candidate={}}={}){
  const better=Number(candidate?.hidden_pass_rate)>Number(baseline?.hidden_pass_rate)&&Number(candidate?.critical_regressions||0)===0;return{contract:"AVANTIQO_CODE_SELF_IMPROVEMENT_GATE_V1",retain_candidate:better,requires_hidden_benchmark:true,critical_regression_free_required:true,automatic_trust_promotion:false};
}

export function deriveCodeAILocalSpecializationPlan({verifiedMissions=0}={}){
  return{contract:"AVANTIQO_CODE_LOCAL_SPECIALIZATION_V1",eligible:verifiedMissions>=200,specialists:["repository_navigation","failure_classification","test_selection","patch_critique","sql_schema_reasoning","frontend_review"],training_source:"VERIFIED_MISSIONS_ONLY",authority_effect:"NONE"};
}

export function deriveCodeAIRepositorySpecialistPlan({verifiedMissions=0,repositoryUrl}={}){
  return{contract:"AVANTIQO_CODE_REPOSITORY_SPECIALIST_V1",repository_url:text(repositoryUrl,1000)||null,eligible:verifiedMissions>=500,scope:"ONE_REPOSITORY_FAMILY",verified_data_only:true,authority_effect:"NONE"};
}

export function scheduleCodeAIAgentThroughput({jobs=[],gpuMemoryMb=0}={}){
  const ordered=list(jobs).map((j,i)=>({...j,_i:i})).sort((a,b)=>(Number(b?.priority||0)-Number(a?.priority||0))||(Number(a?.estimated_cost||0)-Number(b?.estimated_cost||0))||a._i-b._i).map(({_i,...j})=>j);return{contract:"AVANTIQO_CODE_AGENT_SCHEDULER_V1",gpu_memory_mb:Number(gpuMemoryMb)||0,queue:ordered,local_first:true,org_fairness_required:true,modal_escalation_requires_policy:true};
}

export function deriveCodeAIComputeEconomics({thb=0,reasoningCalls=0,gpuSeconds=0,browserSeconds=0,toolCalls=0,retries=0,verified=false}={}){
  return{contract:"AVANTIQO_CODE_COMPUTE_ECONOMICS_V1",thb:Number(thb)||0,reasoning_calls:Number(reasoningCalls)||0,gpu_seconds:Number(gpuSeconds)||0,browser_seconds:Number(browserSeconds)||0,tool_calls:Number(toolCalls)||0,retries:Number(retries)||0,verified:verified===true,thb_per_verified_task:verified?Number(thb)||0:null};
}

export function deriveCodeAIComparativeBenchmark({avantiqo={},competitor={}}={}){
  const metrics=["verified_completion_rate","first_pass_success_rate","escaped_regression_rate","human_intervention_rate","wall_ms","cost_thb","patch_size","security_defects","ui_defects"];return{contract:"AVANTIQO_CODE_COMPARATIVE_BENCHMARK_V1",metrics,controls:{same_repository_snapshot:true,same_issue:true,same_allowed_tools:true,same_time_budget:true,same_acceptance_tests:true},avantiqo:object(avantiqo),competitor:object(competitor),winner:null,human_decision_supported:true};
}

export function summarizeCodeAIEngineeringPrecision({input={}}={}){
  return{contract:CODE_AI_ENGINEERING_PRECISION_CONTRACT,generated_at:now(),capabilities:{semantic_lsp:true,incremental_index:true,test_impact:true,coverage_guidance:true,mutation_testing:true,fuzz_testing:true,git_history:true,regression_archaeology:true,flaky_intelligence:true,environment_fingerprint:true,supply_chain_scan:true,taint_signals:true,patch_minimization:true,uncertainty:true,tool_cache:true,context_compiler:true,context_compression:true,watchdog:true,failure_injection:true,concurrency_lab:true,staging_canary:true,rollback:true,business_invariants:true,shadow_compare:true,user_flow_replay:true,visual_regression:true,accessibility:true,pr_review_comments:true,reviewer_calibration:true,self_improvement_benchmark:true,local_specialization:true,repository_specialist:true,throughput_scheduler:true,compute_economics:true,comparative_benchmark:true},input_summary:object(input),authority_effect:"NONE"};
}
