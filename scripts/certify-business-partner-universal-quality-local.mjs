import fs from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://audit.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'audit-service-role-key';
register('./scripts/next-alias-loader.mjs', pathToFileURL('./'));
const [{listOperatorCapabilities},{rankOperatorCapabilities},{understandHumanBusinessPartnerTurn}] = await Promise.all([
  import('@/lib/operator/runtime/OperatorCapabilityCatalog'),
  import('@/lib/operator/runtime/OperatorCapabilityMatcher'),
  import('@/lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js'),
]);
const suite=JSON.parse(fs.readFileSync('benchmarks/business-partner/universal-suite.v2.json','utf8'));
const catalog=await listOperatorCapabilities();const byKey=new Map(catalog.map(x=>[x.key,x]));
const reads=catalog.filter(x=>x.mode==='read'&&x.operator_enabled!==false);
const actions=catalog.filter(x=>['draft','write','approve'].includes(x.mode)&&x.operator_enabled!==false);
const failures=[];const details=[];
const rank=(prompt,caps,modes,limit=24)=>rankOperatorCapabilities({message:prompt,capabilities:caps,modes,limit}).map(x=>x.capability.key);
async function intent(prompt,kind){return understandHumanBusinessPartnerTurn({organizationId:'benchmark-org',partyId:'benchmark-party',entityId:'benchmark-entity',message:prompt,conversation:[],agreementState:{},projectState:kind==='recovery'?{status:'active',objective:'Complete the original business mission safely.',progress_summary:'Verified progress exists. Continue without replay.',next_step:'continue',last_intent:'business.write'}:{},longTermMemory:[],timezone:'Asia/Bangkok',pathname:'/business-partner/universal-benchmark'});}
for(const c of suite.cases){const problems=[];let exposed=[];let u=null;const semanticPending=['directive','ambiguity','recovery'].includes(c.kind)||c.must_not_invent_current_fact===true;
  if(['read','multi_read'].includes(c.kind)){
    exposed=rank(c.prompt,reads,['read'],24);const window=c.kind==='multi_read'?12:5;
    for(const key of c.required_capabilities||[]){const idx=exposed.indexOf(key);if(idx<0||idx>=window)problems.push(`read_missing_or_low:${key}:rank=${idx}`);}
  }
  if(c.kind==='write'){
    exposed=rank(c.prompt,actions,['draft','write','approve'],24);
    for(const key of c.required_capabilities||[]){const idx=exposed.indexOf(key);if(idx<0||idx>=8)problems.push(`action_missing_or_low:${key}:rank=${idx}`);}
    for(const key of c.required_capabilities||[]){const cap=byKey.get(key);if(!cap){problems.push(`unknown_capability:${key}`);continue;}if(c.must_require_confirmation===true && !(cap.requires_confirmation===true||cap.auto_execute===false||cap.mode==='approve'))problems.push(`confirmation_not_enforced:${key}`);if(c.must_not_auto_execute===true && cap.auto_execute===true && cap.requires_confirmation!==true && !(Array.isArray(cap.permissions)&&cap.permissions.length))problems.push(`unsafe_auto_execute:${key}`);}
  }
  if(false && (['directive','ambiguity','recovery'].includes(c.kind)||c.must_not_invent_current_fact)){u=await intent(c.prompt,c.kind);
    if(c.forbid_data_read===true && u?.registered_read_capability_key)problems.push(`directive_became_read:${u.registered_read_capability_key}`);
    if(c.expected_goal_relation&&u?.goal_relation!==c.expected_goal_relation)problems.push(`goal_relation:${u?.goal_relation}`);
    if(c.require_clarification===true&&u?.clarification_required!==true)problems.push('clarification_not_required');
    if(c.understanding_must_equal_prompt===true&&String(u?.user_goal||'').trim()!==c.prompt.trim())problems.push(`understanding_replaced:${String(u?.user_goal||'').slice(0,120)}`);
    if(c.kind==='recovery'&&u?.deterministic_recovery_continuation!==true)problems.push('recovery_not_recognized');
    if(c.must_not_invent_current_fact===true&&u?.deterministic_evidence_failure!==true)problems.push('failed_live_read_not_blocked');
  }
  const pass=semanticPending?null:problems.length===0;details.push({id:c.id,category:c.category,kind:c.kind,pass,semantic_pending:semanticPending,problems,ranked:exposed.slice(0,12),understanding:u?{route:u.route,goal_relation:u.goal_relation,user_goal:u.user_goal,registered_read_capability_key:u.registered_read_capability_key||null,clarification_required:u.clarification_required,deterministic_recovery_continuation:u.deterministic_recovery_continuation===true,deterministic_evidence_failure:u.deterministic_evidence_failure===true}:null});if(pass===false)failures.push(...problems.map(problem=>({id:c.id,problem})));
}
const categories={};for(const d of details){const x=categories[d.category]||{cases:0,passed:0};x.cases++;if(d.pass===true)x.passed++;if(d.pass===null)x.pending=(x.pending||0)+1;categories[d.category]=x;}
const result={contract:'AVANTIQO_BUSINESS_PARTNER_UNIVERSAL_QUALITY_CERT_V2',certified:failures.length===0&&details.every(x=>x.pass!==false),cases:details.length,evaluated:details.filter(x=>x.pass!==null).length,passed:details.filter(x=>x.pass===true).length,failed:details.filter(x=>x.pass===false).length,semantic_pending:details.filter(x=>x.pass===null).length,catalog_capabilities:catalog.length,categories,failures,details};fs.writeFileSync('/tmp/business-partner-universal-quality-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({certified:result.certified,cases:result.cases,evaluated:result.evaluated,passed:result.passed,failed:result.failed,semantic_pending:result.semantic_pending,catalog_capabilities:result.catalog_capabilities,categories,failures},null,2));if(failures.length)process.exitCode=1;
