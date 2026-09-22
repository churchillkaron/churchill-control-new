import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCodeAISemanticFileIndex,
  deriveCodeAITestImpact,
  deriveCodeAICoverageObligations,
  generateCodeAIMutants,
  generateCodeAIFuzzCases,
  fingerprintCodeAIEnvironment,
  scanCodeAISupplyChain,
  deriveCodeAITaintSignals,
  minimizeCodeAIPatchPlan,
  calibrateCodeAIUncertainty,
  deriveCodeAIFlakyTestProfile,
  deriveCodeAIContextPacket,
  cachedCodeAIToolResult,
  deriveCodeAIWatchdog,
  deriveCodeAIFailureInjectionPlan,
  deriveCodeAIConcurrencyPlan,
  deriveCodeAIReleasePipeline,
  deriveCodeAIBusinessInvariantSuite,
  deriveCodeAIShadowComparison,
  deriveCodeAIVisualRegression,
  deriveCodeAIAccessibilityGate,
  deriveCodeAIReviewCalibration,
  deriveCodeAISelfImprovementDecision,
  deriveCodeAILocalSpecializationPlan,
  deriveCodeAIRepositorySpecialistPlan,
  scheduleCodeAIAgentThroughput,
  deriveCodeAIComputeEconomics,
  deriveCodeAIComparativeBenchmark,
  summarizeCodeAIEngineeringPrecision,
} from "../lib/code/runtime/CodeAIEngineeringPrecisionRuntime.js";

test("TypeScript semantic index extracts symbols imports calls and diagnostics",()=>{
 const x=buildCodeAISemanticFileIndex({filePath:"a.ts",content:'import { b } from "./b"; export interface X { id:string } export function f(v:X){ return b(v.id) }'});
 assert.ok(x.symbols.some(s=>s.name==="X")); assert.ok(x.symbols.some(s=>s.name==="f")); assert.ok(x.imports.includes("./b")); assert.ok(x.calls.some(c=>c.callee==="b")); assert.equal(x.compiler_grade_parser,true);
});
test("test impact maps changed symbols to tests",()=>{const x=deriveCodeAITestImpact({changedSymbols:["invoiceTotal"],tests:[{path:"tests/a.test.ts",content:"invoiceTotal(x)"},{path:"tests/b.test.ts",content:"other()"}]});assert.equal(x.impacted_tests.length,1);assert.equal(x.impacted_tests[0].test_path,"tests/a.test.ts")});
test("coverage identifies uncovered changed lines",()=>{const x=deriveCodeAICoverageObligations({changedLines:[{file:"a.js",line:1},{file:"a.js",line:2}],coverage:{"a.js":{1:1,2:0}}});assert.equal(x.changed_line_coverage,.5);assert.equal(x.complete,false)});
test("mutation engine creates bounded mutants",()=>{const x=generateCodeAIMutants({filePath:"a.js",content:"if (x === 1) return true;",limit:8});assert.ok(x.mutant_count>0);assert.ok(x.mutants.every(m=>m.content!=="if (x === 1) return true;"))});
test("fuzz generator creates boundary cases",()=>{const x=generateCodeAIFuzzCases({schema:{properties:{name:{type:"string"},amount:{type:"number"}}}});assert.ok(x.case_count>3);assert.ok(x.cases.some(c=>c.field==="amount"&&c.input.amount===-1))});
test("environment fingerprint changes with lockfile",()=>{const a=fingerprintCodeAIEnvironment({lockfile:"a"});const b=fingerprintCodeAIEnvironment({lockfile:"b"});assert.notEqual(a.fingerprint,b.fingerprint)});
test("supply chain scan detects non-registry deps and secrets",()=>{const x=scanCodeAISupplyChain({lockfile:'{"resolved":"git+https://x"}',sourceFiles:[{path:"x",content:"AKIAABCDEFGHIJKLMNOP"}]});assert.equal(x.passed,false);assert.ok(x.findings.length>=2)});
test("taint signal flags nearby input-to-sink patterns",()=>{const x=deriveCodeAITaintSignals({filePath:"a.js",content:"const x=request.body; eval(x)"});assert.ok(x.signals.length>0)});
test("patch minimization never grants automatic removal",()=>{const x=minimizeCodeAIPatchPlan({changes:[{path:"a"},{path:"b"}],verifiedRequiredPaths:["a"]});assert.deepEqual(x.candidate_removable_paths,["b"]);assert.equal(x.automatic_removal_authority,false)});
test("uncertainty blocks contradictions",()=>{const x=calibrateCodeAIUncertainty({facts:[{verified:true}],hypotheses:[{}],contradictions:[{}]});assert.equal(x.state,"CONTRADICTED");assert.equal(x.completion_allowed,false)});
test("flaky profile distinguishes mixed pass fail history",()=>{const x=deriveCodeAIFlakyTestProfile({runs:[{test:"a",passed:true},{test:"a",passed:false}]});assert.equal(x.flaky_tests.length,1);assert.equal(x.quarantine_auto_certification_allowed,false)});
test("context compiler excludes private reasoning",()=>{const x=deriveCodeAIContextPacket({objective:"fix",facts:[{verified:true,fact:"x"}]});assert.equal(x.raw_chain_of_thought_included,false);assert.ok(x.serialized_chars>0)});
test("tool cache is deterministic by head environment and key",async()=>{let n=0;const a=await cachedCodeAIToolResult({key:"k",head:"h",environmentFingerprint:"e",loader:async()=>({v:++n})});const b=await cachedCodeAIToolResult({key:"k",head:"h",environmentFingerprint:"e",loader:async()=>({v:++n})});assert.equal(a.cache_hit,false);assert.equal(b.cache_hit,true);assert.equal(n,1)});
test("watchdog detects repeated no-progress actions",()=>{const ev=Array.from({length:4},()=>({action:"read",description:"same",input:{path:"a"}}));assert.equal(deriveCodeAIWatchdog({events:ev}).recovery_required,true)});
test("failure injection is non-production",()=>assert.equal(deriveCodeAIFailureInjectionPlan({surfaces:["api"]}).production_execution_allowed,false));
test("concurrency lab requires exactly-once or idempotency proof",()=>assert.equal(deriveCodeAIConcurrencyPlan({operations:["invoice.create"]}).exactly_once_or_idempotency_proof_required,true));
test("release pipeline orders preview shadow canary before production",()=>{const s=deriveCodeAIReleasePipeline({risk:"high"}).stages;assert.ok(s.indexOf("PREVIEW_DEPLOY")<s.indexOf("SHADOW_COMPARE"));assert.ok(s.indexOf("SHADOW_COMPARE")<s.indexOf("PRODUCTION_100_PERCENT"))});
test("finance invariants include balancing and invoice reconciliation",()=>{const x=deriveCodeAIBusinessInvariantSuite({domain:"finance"});assert.ok(x.invariants.includes("journal_balances"));assert.ok(x.invariants.includes("invoice_totals_reconcile"))});
test("shadow comparison blocks unexpected differences",()=>{const x=deriveCodeAIShadowComparison({baseline:[{id:"1",response:{a:1}}],candidate:[{id:"1",response:{a:2}}]});assert.equal(x.passed,false)});
test("visual regression obeys threshold",()=>assert.equal(deriveCodeAIVisualRegression({candidate:{difference_ratio:.02},threshold:.01}).passed,false));
test("accessibility gate blocks serious violations",()=>assert.equal(deriveCodeAIAccessibilityGate({violations:[{impact:"serious"}]}).passed,false));
test("review calibration never auto-increases authority",()=>assert.equal(deriveCodeAIReviewCalibration({reviews:[]}).automatic_authority_increase,false));
test("self-improvement only retains hidden-benchmark improvement without critical regression",()=>assert.equal(deriveCodeAISelfImprovementDecision({baseline:{hidden_pass_rate:.8},candidate:{hidden_pass_rate:.9,critical_regressions:0}}).retain_candidate,true));
test("local specialization requires verified mission volume",()=>assert.equal(deriveCodeAILocalSpecializationPlan({verifiedMissions:199}).eligible,false));
test("repository specialist requires higher verified mission volume",()=>assert.equal(deriveCodeAIRepositorySpecialistPlan({verifiedMissions:500,repositoryUrl:"x"}).eligible,true));
test("throughput scheduler remains local first",()=>assert.equal(scheduleCodeAIAgentThroughput({jobs:[]}).local_first,true));
test("compute economics reports THB per verified task",()=>assert.equal(deriveCodeAIComputeEconomics({thb:2.5,verified:true}).thb_per_verified_task,2.5));
test("comparative benchmark does not declare a winner itself",()=>assert.equal(deriveCodeAIComparativeBenchmark({}).winner,null));
test("precision summary exposes all thirty-five capabilities",()=>{const x=summarizeCodeAIEngineeringPrecision({});assert.equal(Object.keys(x.capabilities).length,35);assert.equal(x.authority_effect,"NONE")});
