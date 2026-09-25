import crypto from "node:crypto";

export const CREATIVE_STILL_FINISHING_CHAIN_CONTRACT = "CREATIVE_STILL_FINISHING_CHAIN_V1";

const STAGES = Object.freeze([
  { id:"retouch", owner:"image_retouching_director", required_for:["PHOTOGRAPHIC","SOURCE_EDITING","PREMIUM_AD"], evidence:["retouch_qc_sealed","source_identity_preserved","local_repair_preferred"] },
  { id:"composite", owner:"compositing_supervisor", required_for:["COMPOSITE","PREMIUM_AD"], evidence:["composite_qc_sealed","edge_integration_verified","light_depth_perspective_verified"] },
  { id:"color_di", owner:"color_di_supervisor", required_for:["PHOTOGRAPHIC","PREMIUM_AD"], evidence:["color_di_qc_sealed","skin_product_truth_preserved","highlight_black_detail_verified"] },
  { id:"master_finish", owner:"post_production_supervisor", required_for:["PREMIUM_AD","MULTI_FORMAT","PRINT"], evidence:["master_finish_qc_sealed","version_lineage_verified","delivery_variants_verified"] },
]);

function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
function completed(task){return ["COMPLETED","APPROVED","PASSED","RELEASED"].includes(text(task?.status).toUpperCase());}
function haystack(task){return [task?.type,task?.title,task?.description,task?.capability,task?.service_code,task?.metadata?.production_step_id].map(text).join(" ").toLowerCase();}

export function buildCreativeStillFinishingChain({ tasks = [], plan = {}, assets = [] } = {}) {
  const signals=object(plan.signals);
  const controls=object(plan.controls);
  const flags=new Set();
  if(signals.photographic) flags.add("PHOTOGRAPHIC");
  const explicitSourceEditing=list(tasks).some((t)=>/retouch|repair|inpaint|outpaint|relight|cleanup|source edit|source-preserving/.test(haystack(t))) ||
    list(assets).some((asset)=>asset?.metadata?.source_editing_required===true || asset?.metadata?.source_preserving_edit===true);
  if(signals.source_editing && explicitSourceEditing) flags.add("SOURCE_EDITING");
  if(controls.premium_advertising_benchmark) flags.add("PREMIUM_AD");
  if(signals.multi_format) flags.add("MULTI_FORMAT");
  if(signals.print_required) flags.add("PRINT");
  if(list(tasks).some((t)=>/composite|matte|cutout|blend|background replacement/.test(haystack(t)))) flags.add("COMPOSITE");

  let previousDigest=null;
  const stages=STAGES.map((stage)=>{
    const required=stage.required_for.some((flag)=>flags.has(flag));
    const matching=list(tasks).filter((task)=>{
      const h=haystack(task);
      if(stage.id==="retouch") return /retouch|repair|inpaint|outpaint|relight|cleanup/.test(h);
      if(stage.id==="composite") return /composite|compositing|matte|cutout|background replacement/.test(h);
      if(stage.id==="color_di") return /color|colour|grade|di|look development/.test(h);
      return /master finish|mastering|final master|export|delivery variant|render master/.test(h);
    });
    const done=matching.some(completed);
    const assetEvidence=list(assets).some((asset)=>stage.evidence.every((field)=>asset?.metadata?.[field]===true));
    const passed=!required || done || assetEvidence;
    const body={id:stage.id,owner_role_id:stage.owner,required,passed,task_ids:matching.map((t)=>t.id).filter(Boolean),evidence_fields:stage.evidence,input_digest:previousDigest};
    body.stage_digest=hash(body);
    if(required) previousDigest=body.stage_digest;
    return body;
  });
  const failures=stages.filter((stage)=>stage.required&&!stage.passed).map((stage)=>`STILL_FINISHING_STAGE_REQUIRED:${stage.id}`);
  return Object.freeze({contract:CREATIVE_STILL_FINISHING_CHAIN_CONTRACT,passed:failures.length===0,failures,flags:[...flags],stages,final_chain_digest:previousDigest,policies:{generation_completion_is_not_finishing:true,stage_ownership_required:true,bounded_repair_before_regeneration:true,color_may_not_hide_weak_imagery:true,mastering_requires_version_lineage:true}});
}

export const CreativeStillFinishingChainRuntime=Object.freeze({contract:CREATIVE_STILL_FINISHING_CHAIN_CONTRACT,stages:STAGES,build:buildCreativeStillFinishingChain});
export default CreativeStillFinishingChainRuntime;
