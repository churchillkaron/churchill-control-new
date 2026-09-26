import fs from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://audit.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'audit-service-role-key';
register('./scripts/next-alias-loader.mjs', pathToFileURL('./'));
const [{listOperatorCapabilities},{rankOperatorCapabilities},{understandHumanBusinessPartnerTurn},{resolveOperatorMultiReadRequirement},{prioritizeOperatorBusinessReads}] = await Promise.all([
  import('@/lib/operator/runtime/OperatorCapabilityCatalog'),
  import('@/lib/operator/runtime/OperatorCapabilityMatcher'),
  import('@/lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js'),
  import('@/lib/operator/runtime/OperatorReasoningRuntime.js'),
  import('@/lib/operator/runtime/OperatorBusinessReadResolver.js'),
]);
const suite=JSON.parse(fs.readFileSync('benchmarks/business-partner/universal-suite.v2.json','utf8'));
const catalog=await listOperatorCapabilities();
const byKey=new Map(catalog.map(x=>[x.key,x]));
const reads=catalog.filter(x=>x.mode==='read'&&x.operator_enabled!==false);
const actions=catalog.filter(x=>['draft','write','approve'].includes(x.mode)&&x.operator_enabled!==false);
const failures=[];const details=[];
const rank=(prompt,caps,modes,limit=24)=>rankOperatorCapabilities({message:prompt,capabilities:caps,modes,limit}).map(x=>x.capability.key);
const FULL_ACCESS_ROLES=new Set(["OWNER","ORGANIZATION_OWNER","ORG_OWNER","PLATFORM_OWNER","SUPER_ADMIN"]);
function permissionMatches(granted,required){const a=String(granted||"").toLowerCase();const r=String(required||"").toLowerCase();return Boolean(a&&r&&(a==="*"||a===r||(a.endsWith(".*")&&r.startsWith(a.slice(0,-1)))));}
function actorCanUse(cap,role,permissions=[]){if(FULL_ACCESS_ROLES.has(String(role||"").toUpperCase()))return true;const required=Array.isArray(cap?.permissions)?cap.permissions:[];if(!required.length)return false;return required.every(r=>permissions.some(p=>permissionMatches(p,r)));}
async function intent(c){
  const project=c.kind==='recovery'?{status:'active',objective:'Complete the original business mission safely.',progress_summary:'Verified progress exists. Continue without replay.',next_step:'continue',last_intent:'business.write'}:{};
  return understandHumanBusinessPartnerTurn({organizationId:'benchmark-org',partyId:'benchmark-party',entityId:'benchmark-entity',message:c.prompt,conversation:[],agreementState:{},projectState:project,longTermMemory:[],timezone:'Asia/Bangkok',pathname:'/business-partner/universal-benchmark'});
}
for(const c of suite.cases){
  const problems=[];let ranked=[];let u=null;let evaluated=true;
  if(['read','multi_read'].includes(c.kind)){
    ranked=rank(c.prompt,reads,['read'],24);const window=c.kind==='multi_read'?12:5;
    for(const key of c.required_capabilities||[]){const idx=ranked.indexOf(key);if(idx<0||idx>=window)problems.push(`read_missing_or_low:${key}:rank=${idx}`);}
    if(c.kind==='multi_read'){
      const requirement=resolveOperatorMultiReadRequirement({message:c.prompt,capabilities:catalog});
      if(!requirement)problems.push('multi_read_requirement_missing');
      for(const key of c.required_capabilities||[]){if(!requirement?.capability_keys?.includes(key))problems.push(`multi_read_requirement_missing_key:${key}`);}
      const prioritized=prioritizeOperatorBusinessReads({message:c.prompt,capabilities:catalog,limit:18}).capabilities.map(x=>x.key);
      if(!prioritized.includes('platform.operator_read_chain.execute'))problems.push('read_chain_not_exposed');
    }
  } else if(c.kind==='write'){
    ranked=rank(c.prompt,actions,['draft','write','approve'],24);
    for(const key of c.required_capabilities||[]){const idx=ranked.indexOf(key);if(idx<0||idx>=8)problems.push(`action_missing_or_low:${key}:rank=${idx}`);}
    for(const key of c.required_capabilities||[]){const cap=byKey.get(key);if(!cap){problems.push(`unknown_capability:${key}`);continue;}if(c.must_require_confirmation===true&&!(cap.requires_confirmation===true||cap.auto_execute===false||cap.mode==='approve'))problems.push(`confirmation_not_enforced:${key}`);if(c.must_not_auto_execute===true&&cap.auto_execute===true&&cap.requires_confirmation!==true)problems.push(`unsafe_auto_execute:${key}`);if(c.must_be_ineligible_without_permission===true&&actorCanUse(cap,c.actor_role,c.actor_permissions||[]))problems.push(`permission_boundary_failed:${key}`);}
  } else if(['directive','ambiguity','recovery'].includes(c.kind)||c.must_not_invent_current_fact){
    u=await intent(c);
    if(c.forbid_data_read===true&&u?.registered_read_capability_key)problems.push(`directive_became_read:${u.registered_read_capability_key}`);
    if(c.expected_goal_relation&&u?.goal_relation!==c.expected_goal_relation)problems.push(`goal_relation:${u?.goal_relation}`);
    if(c.require_clarification===true&&u?.clarification_required!==true)problems.push('clarification_not_required');
    if(c.understanding_must_equal_prompt===true&&String(u?.user_goal||'').trim()!==c.prompt.trim())problems.push(`understanding_replaced:${String(u?.user_goal||'').slice(0,120)}`);
    if(c.kind==='recovery'&&u?.deterministic_recovery_continuation!==true)problems.push('recovery_not_recognized');
    if(c.must_not_invent_current_fact===true&&u?.deterministic_evidence_failure!==true)problems.push('failed_live_read_not_blocked');
    if(u?.semantic_provider)problems.push(`unexpected_semantic_provider:${u.semantic_provider}`);
  } else {
    evaluated=false;
  }
  const pass=evaluated&&problems.length===0;
  details.push({id:c.id,category:c.category,kind:c.kind,evaluated,pass,problems,ranked:ranked.slice(0,12),understanding:u?{route:u.route,goal_relation:u.goal_relation,user_goal:u.user_goal,registered_read_capability_key:u.registered_read_capability_key||null,clarification_required:u.clarification_required,deterministic_recovery_continuation:u.deterministic_recovery_continuation===true,deterministic_evidence_failure:u.deterministic_evidence_failure===true,semantic_provider:u.semantic_provider||null}:null});
  if(evaluated&&problems.length)failures.push(...problems.map(problem=>({id:c.id,problem})));
}
const evaluated=details.filter(x=>x.evaluated);
const capabilityPhase=details.filter(x=>['read','multi_read','write'].includes(x.kind));
const semanticPhase=details.filter(x=>['directive','ambiguity','recovery'].includes(x.kind)||x.id==='governance-03');
const categories={};for(const d of evaluated){const x=categories[d.category]||{cases:0,passed:0};x.cases++;if(d.pass)x.passed++;categories[d.category]=x;}
const result={
  contract:'AVANTIQO_BUSINESS_PARTNER_UNIVERSAL_QUALITY_CERT_V2',
  certified:failures.length===0&&evaluated.length===suite.cases.length,
  suite_cases:suite.cases.length,
  evaluated_cases:evaluated.length,
  passed:evaluated.filter(x=>x.pass).length,
  failed:evaluated.filter(x=>!x.pass).length,
  catalog_capabilities:catalog.length,
  phases:{
    capability_planning:{cases:capabilityPhase.length,passed:capabilityPhase.filter(x=>x.pass).length,failed:capabilityPhase.filter(x=>!x.pass).length},
    semantic_continuity:{cases:semanticPhase.length,passed:semanticPhase.filter(x=>x.pass).length,failed:semanticPhase.filter(x=>!x.pass).length,provider_calls:semanticPhase.filter(x=>x.understanding?.semantic_provider).length},
  },
  categories,failures,details,
  external_reference_calls_performed:false,
  provider_spend_performed:false,
  production_writes_performed:false,
  production_deploy_performed:false,
  authorization_effect:'NONE',
};
fs.writeFileSync('/tmp/business-partner-universal-quality-result.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({certified:result.certified,suite_cases:result.suite_cases,evaluated_cases:result.evaluated_cases,passed:result.passed,failed:result.failed,catalog_capabilities:result.catalog_capabilities,phases:result.phases,failures:result.failures},null,2));
if(!result.certified)process.exitCode=1;
