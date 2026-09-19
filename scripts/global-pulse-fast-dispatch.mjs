import { AVANTIQO_GLOBAL_PULSE_V3_OPENING_PLAN as plan } from '../lib/creative/director/runtime/AvantiqoInvestorGlobalPulseV3OpeningPlan.js';
import { executeService, settlePendingService } from '../lib/platform/service-runtime/execution/ServiceExecutionRuntime.js';
const org='9a148429-b6a0-4bc6-ac83-a35c64fb7045';
const project='e47948a1-ab5a-42ce-87d6-492a999bed98';
const policy={benchmark_only:true,execution_scope:'BENCHMARK_REVIEW_PREVIEW',allowed_providers:['avantiqo-video'],preferred_providers:['avantiqo-video'],owned_only_required:true,owned_first_required:true,external_fallback_allowed:false,studio_preproduction_review:true};
const shots=plan.scenes.flatMap(s=>s.shots).filter(s=>s.generation?.required);
function prompt(s){
 const d=s.metadata?.directing_intelligence||{};
 return [s.title+'.',s.action+'.',d.dramatic_objective||'',d.performance_direction?.performance||s.performance||'',d.agency_craft?.material_detail||'',d.agency_craft?.reject_if?('Reject: '+d.agency_craft.reject_if):'',...(s.negative_constraints||[]).map(x=>'Avoid '+x+'.')].filter(Boolean).join(' ');
}
function sourceIds(s){return (s.reference_assets||[]).map(x=>x.asset_id).filter(Boolean)}
async function dispatch(s){
 const capability=s.generation.capability;
 const editorial=Math.max(0.15,Number(s.duration_seconds||1));
 const source=sourceIds(s);
 const input={
   capability, provider_prompt:prompt(s), title:s.title, shot_id:s.id,
   shot_bible:{contract:'CREATIVE_SHOT_BIBLE_V1',shot_id:s.id,creative_project_id:project,story:{title:s.title,action:s.action,purpose:s.purpose,subject:s.subject,performance:s.performance},camera:s.camera,lighting:s.lighting,environment:{location:s.location},constraints:{negative:s.negative_constraints||[]},output:{type:'video',aspect_ratio:'16:9',duration_seconds:Math.max(1,Math.ceil(editorial)),editorial_duration_seconds:editorial,master_resolution:'1920x1088'},completeness:{passed:true,missing:[]}},
   metadata:{video_execution_profile:'FAST_DISTILLED_1920',studio_preproduction_review:true,creative_project_id:project,canonical_opening_blueprint:s.metadata?.canonical_opening_blueprint,master_timeline_start_seconds:s.metadata?.master_timeline_start_seconds,editorial_duration_seconds:editorial,hero_shot:s.metadata?.hero_shot===true},
   generation:{duration_seconds:Math.max(1,Math.ceil(editorial)),output_spec:{type:'video',aspect_ratio:'16:9',duration_seconds:Math.max(1,Math.ceil(editorial)),editorial_duration_seconds:editorial,master_resolution:'1920x1088'}},
   output_spec:{type:'video',aspect_ratio:'16:9',duration_seconds:Math.max(1,Math.ceil(editorial)),editorial_duration_seconds:editorial,master_resolution:'1920x1088'},
   ...(source.length?{source_assets:source,reference_asset_ids:source,source_image:source[0]}:{}),
 };
 const r=await executeService({organization_id:org,service_id:capability,capability,input,metadata:{creative_project_id:project,shot_id:s.id,video_execution_profile:'FAST_DISTILLED_1920',service_cost_guard_maximum_customer_price:60},provider_policy:policy});
 return {shot:s.id,title:s.title,start:s.metadata.master_timeline_start_seconds,editorial,capability,usage_id:r.usage?.id,job_id:r.provider_job_id,pricing:r.pricing?.customer_price,status:r.provider_status};
}
async function main(){
 const skip=new Set((process.env.SKIP_SHOTS||'').split(',').filter(Boolean));
 const selected=shots.filter(s=>!skip.has(s.id));
 const out=[];
 for(let i=0;i<selected.length;i+=5){
   const wave=selected.slice(i,i+5);
   const results=await Promise.all(wave.map(dispatch));
   out.push(...results); console.log('WAVE',i/5+1,JSON.stringify(results));
 }
 console.log('DISPATCHED='+JSON.stringify(out));
}
await main();
