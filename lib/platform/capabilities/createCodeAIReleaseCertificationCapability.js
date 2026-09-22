import { CodeWorkspaceRuntime } from "@/lib/code/runtime/CodeWorkspaceRuntime";
import {
  loadCodeAICommitArtifact,
  persistCodeAICommitArtifact,
} from "@/lib/code/runtime/CodeAICommitArtifactRuntime";
import { attestCodeMissionState } from "@/lib/code/runtime/CodeMissionAttestationRuntime";
import { verifyExistingVercelDeployment } from "@/lib/platform/runtime/AvantiqoProductionReleaseRuntime";
import {
  deriveCodeAIShadowComparison,
  deriveCodeAIReleasePipeline,
} from "@/lib/code/runtime/CodeAIEngineeringPrecisionRuntime";
import {
  finalizeCodeAIEngineeringPrecisionOS,
} from "@/lib/code/runtime/CodeAIEngineeringPrecisionOperatingSystemRuntime";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const REQUIRED_PERMISSION = "platform.deploy.production";
function text(v,n=4000){return String(v??"").trim().slice(0,n)}
function list(v){return Array.isArray(v)?v:[]}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
function joinUrl(base, suffix){return `${text(base,2000).replace(/\/+$/,'')}/${text(suffix,1200).replace(/^\/+/, '')}`}
async function readHttp(url, fetchImpl){const response=await fetchImpl(url,{method:"GET",redirect:"follow",cache:"no-store",signal:AbortSignal.timeout(20000)});const body=await response.text();return{status:response.status,body:body.slice(0,200000)}}

export function createCodeAIReleaseCertificationCapability(){
 const manifest=defineCapability({domain:"platform",capability:"code_ai_release_certification",action:"execute",description:"Certify the exact draft-review commit against a READY Vercel preview/staged deployment, connected-browser user flow, accessibility and visual evidence, read-only shadow comparisons, and candidate-branch invariant tests. Writes only server-owned proof back into the unattempted attested Code artifact. It does not merge, commit, promote or deploy production.",permissions:[REQUIRED_PERMISSION],events:[],tags:["platform","code-ai","release-certification","preview","shadow","canary","rollback-plan","no-production-side-effect"],transactional:false,aiEnabled:true,operatorEnabled:true,operatorMode:"write",operatorAutoExecute:false,operatorRequiresConfirmation:true,contextScope:"organization",risk:"medium",reversible:true,inputSchema:{type:"object",required:["execution_key","deployment_id","preview_url","baseline_url","device_id","browser_steps","shadow_paths","invariant_commands"],properties:{execution_key:{type:"string",minLength:12,maxLength:160},deployment_id:{type:"string",minLength:1,maxLength:300},preview_url:{type:"string",minLength:8,maxLength:2000},baseline_url:{type:"string",maxLength:2000},device_id:{type:"string",minLength:1,maxLength:160},browser_steps:{type:"array",minItems:1,maxItems:24},baseline_screenshot_path:{type:"string",maxLength:2000},visual_threshold:{type:"number",minimum:0,maximum:1},shadow_paths:{type:"array",minItems:1,maxItems:20,items:{type:"string",maxLength:1000}},invariant_commands:{type:"array",minItems:1,maxItems:8,items:{type:"object",required:["command"],properties:{command:{type:"string",maxLength:160},args:{type:"array",maxItems:40,items:{type:"string",maxLength:1000}},cwd:{type:"string",maxLength:1000},timeout_ms:{type:"integer",minimum:1000,maximum:300000}},additionalProperties:false}}},additionalProperties:false}});
 function authorize({context}){return requireExecutionPermission(context,REQUIRED_PERMISSION)}
 async function execute({context,payload={},fetch_impl=globalThis.fetch}){
  const executionKey=text(payload.execution_key,160);
  if(!text(payload.baseline_url,2000)||!list(payload.browser_steps).length||!list(payload.shadow_paths).length||!list(payload.invariant_commands).length)throw new Error("CODE_AI_RELEASE_CERTIFICATION_REQUIRED_PROOF_INPUTS_MISSING");
  const artifact=await loadCodeAICommitArtifact({context,executionKey});
  if(!artifact.found||!artifact.mission_state)throw new Error("CODE_AI_RELEASE_CERTIFICATION_ARTIFACT_NOT_FOUND");
  if(artifact.commit_attempted===true)throw new Error("CODE_AI_RELEASE_CERTIFICATION_ARTIFACT_ALREADY_ATTEMPTED");
  const state=object(artifact.mission_state); const review=object(state.review_delivery);
  if(review.verified!==true||!/^[0-9a-f]{40}$/i.test(text(review.commit_sha,160))||!text(review.review_branch,160))throw new Error("CODE_AI_RELEASE_CERTIFICATION_VERIFIED_REVIEW_REQUIRED");
  const deployment=await verifyExistingVercelDeployment({deployment_id:payload.deployment_id,expected_commit_sha:review.commit_sha,fetch_impl});
  if(deployment.ready!==true||deployment.exact_commit_verified!==true)throw new Error("CODE_AI_RELEASE_CERTIFICATION_DEPLOYMENT_NOT_READY");
  const workspace=await CodeWorkspaceRuntime.open({repository_url:state.repository_url,ref:review.review_branch,workspace_target:"DEVICE",organization_id:context.organizationId,device_id:text(payload.device_id,160),timeout_ms:180000});
  try{
   const browser=await workspace.browserVerify({url:text(payload.preview_url,2000),steps:list(payload.browser_steps),require_accessibility:true,full_page:true,baseline_screenshot_path:text(payload.baseline_screenshot_path,2000)||undefined,visual_threshold:payload.visual_threshold??0.01,timeout_ms:60000});
   if(browser.passed!==true)throw Object.assign(new Error("CODE_AI_RELEASE_CERTIFICATION_BROWSER_FAILED"),{details:browser});
   const invariants=[]; for(const spec of list(payload.invariant_commands)){const result=await workspace.run({command:text(spec?.command,160),args:list(spec?.args).map(String),cwd:text(spec?.cwd,1000)||".",timeout_ms:Number(spec?.timeout_ms)||120000});invariants.push({command:result.command,args:result.args,exit_code:result.exit_code,passed:result.exit_code===0,stdout:text(result.stdout,3000),stderr:text(result.stderr,3000)});if(result.exit_code!==0)throw Object.assign(new Error(`CODE_AI_RELEASE_CERTIFICATION_INVARIANT_FAILED:${result.command}`),{details:result})}
   const shadowBaseline=[]; const shadowCandidate=[]; const baselineUrl=text(payload.baseline_url,2000); for(const [index,suffix] of list(payload.shadow_paths).entries()){if(!baselineUrl)break;const id=`shadow-${index+1}`;const [base,candidate]=await Promise.all([readHttp(joinUrl(baselineUrl,suffix),fetch_impl),readHttp(joinUrl(payload.preview_url,suffix),fetch_impl)]);shadowBaseline.push({id,response:base});shadowCandidate.push({id,response:candidate});}
   const shadow=baselineUrl&&shadowCandidate.length?deriveCodeAIShadowComparison({baseline:shadowBaseline,candidate:shadowCandidate}):{contract:"AVANTIQO_CODE_SHADOW_COMPARE_V1",compared:0,differences:[],unexpected_differences:[],passed:true,not_requested:true};
   if(shadow.passed!==true)throw Object.assign(new Error("CODE_AI_RELEASE_CERTIFICATION_SHADOW_MISMATCH"),{details:shadow});
   const precision={...object(state.precision_evidence),staging_canary:{contract:"AVANTIQO_CODE_STAGING_CANARY_V1",recorded:true,passed:true,verified:true,deployment_id:deployment.deployment_id,commit_sha:review.commit_sha,browser_url:browser.url},progressive_rollback:{contract:"AVANTIQO_CODE_PROGRESSIVE_RELEASE_V1",recorded:true,passed:true,verified:true,plan:deriveCodeAIReleasePipeline({risk:state?.engineering_operating_system?.classification?.risk||"standard",hasDatabaseChange:state?.engineering_operating_system?.classification?.database===true})},business_invariants:{contract:"AVANTIQO_CODE_BUSINESS_INVARIANT_CERTIFICATION_V1",recorded:true,passed:invariants.every(x=>x.passed),verified:true,checks:invariants},shadow_verification:{...shadow,recorded:true,verified:true},user_flow_replay:{contract:"AVANTIQO_CODE_USER_FLOW_REPLAY_V1",recorded:true,passed:browser.replay?.passed===true,verified:true,steps:browser.replay?.steps||[]},accessibility:{contract:"AVANTIQO_CODE_ACCESSIBILITY_V1",recorded:true,passed:browser.accessibility?.passed===true,verified:true,details:browser.accessibility},...(browser.visual_difference_ratio!=null?{visual_regression:{contract:"AVANTIQO_CODE_VISUAL_REGRESSION_V1",recorded:true,passed:browser.visual_passed===true,verified:true,difference_ratio:browser.visual_difference_ratio,threshold:browser.visual_threshold,baseline_sha256:browser.visual_baseline_sha256,candidate_sha256:browser.screenshot_sha256}}:{})};
   const enrichedBase={...state,precision_evidence:precision,release_certification:{contract:"AVANTIQO_CODE_RELEASE_CERTIFICATION_V1",verified:true,review_commit_sha:review.commit_sha,deployment,browser:{url:browser.url,screenshot_path:browser.screenshot_path,screenshot_sha256:browser.screenshot_sha256},shadow,invariants,certified_at:new Date().toISOString()}};
   const refreshedPrecisionOS=finalizeCodeAIEngineeringPrecisionOS({prepared_control:object(state.engineering_precision_os),result:{success:true,state:enrichedBase}});
   const enriched=attestCodeMissionState({...enrichedBase,engineering_precision_os:refreshedPrecisionOS});
   await persistCodeAICommitArtifact({context,executionKey,missionState:enriched});
   return{success:true,contract:"AVANTIQO_CODE_RELEASE_CERTIFICATION_V1",execution_key:executionKey,review_commit_sha:review.commit_sha,deployment_id:deployment.deployment_id,preview_url:browser.url,shadow_passed:shadow.passed===true,invariant_count:invariants.length,user_flow_passed:browser.replay?.passed===true,accessibility_passed:browser.accessibility?.passed===true,visual_passed:browser.visual_difference_ratio==null?null:browser.visual_passed===true,precision_evidence:precision,engineering_precision_os:refreshedPrecisionOS,artifact_re_attested:true,production_deployed:false,merge_performed:false};
  }finally{await workspace.stop()}
 }
 return{manifest,authorize,execute};
}
export default createCodeAIReleaseCertificationCapability;
