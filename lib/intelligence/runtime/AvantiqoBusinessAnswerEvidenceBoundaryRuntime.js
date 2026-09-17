export const AVANTIQO_BUSINESS_ANSWER_EVIDENCE_BOUNDARY_CONTRACT = "AVANTIQO_BUSINESS_ANSWER_EVIDENCE_BOUNDARY_V1";

const list=(v)=>Array.isArray(v)?v:[];
const text=(v,n=12000)=>String(v??"").trim().slice(0,n);
const number=(v)=>Number.isFinite(Number(v))?Number(v):null;

function money(v){const n=number(v);return n===null?null:new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(n)}
function label(v){return text(v,180).replace(/[_-]+/g," ").replace(/\b\w/g,m=>m.toUpperCase())}

function deterministicSafeResponse(brief={}){
  const facts=list(brief.facts), unresolved=list(brief.unresolved), supported=list(brief.supported_external_context);
  const target=facts.find(x=>x?.kind==="TARGET_METRIC");
  const drivers=facts.filter(x=>x?.kind==="INTERNAL_DRIVER").slice(0,4);
  const parts=[];
  if(target){const b=money(target.baseline_value),a=money(target.actual_value);parts.push(`${label(target.metric||brief.metric||"business metric")} changed from ${b??"an unavailable baseline"} to ${a??"an unavailable current value"} in the verified comparison.`)}
  if(drivers.length) parts.push(`Observed internal contributions include ${drivers.map(x=>`${label(x.driver_id)} ${money(x.contribution_amount)??"unquantified"}`).join(", ")}. These are observed contributions, not by themselves complete causal proof.`);
  if(supported.length) parts.push(`Validated external context supports ${supported.map(x=>label(x.context_id)).join(", ")} as contributor${supported.length===1?"":"s"}; no automatic monetary amount is attributed to external context.`);
  const residual=unresolved.find(x=>x?.kind==="MATERIAL_UNEXPLAINED_RESIDUAL");
  if(residual) parts.push(`A material unexplained residual remains${money(residual.amount)!==null?` (${money(residual.amount)})`:""}, so the change is not fully explained.`);
  const gaps=unresolved.filter(x=>x?.kind!=="MATERIAL_UNEXPLAINED_RESIDUAL");
  if(gaps.length) parts.push(`Evidence gaps remain: ${gaps.map(x=>x.context_id?`${label(x.context_id)} (${label(x.causal_state||x.kind)})`:label(x.kind)).join(", ")}.`);
  if(!parts.length) parts.push("The available diagnosis does not contain enough verified evidence for a stronger business explanation.");
  return parts.join(" ");
}

function hasOverclaim(response=""){
  return /\b(fully explained|completely explained|definitively caused|definitely caused|proves? that|proven cause|no uncertainty|entirely caused)\b/i.test(response);
}
function disclosesUncertainty(response=""){
  return /\b(unexplained|unresolved|not fully explained|evidence gap|uncertain|insufficient evidence|cannot attribute|not enough evidence)\b/i.test(response);
}

export function enforceBusinessAnswerEvidenceBoundary({result=null,answer_brief=null}={}){
  const source=result&&typeof result==="object"?result:{};
  const brief=answer_brief&&typeof answer_brief==="object"?answer_brief:{};
  const unresolved=list(brief.unresolved);
  const explanationIncomplete=brief.explanation_complete!==true;
  const original=text(source.response);
  const overclaim=explanationIncomplete&&hasOverclaim(original);
  const missingDisclosure=unresolved.length>0&&!disclosesUncertainty(original);
  let response=original;
  let action="PASS";
  if(overclaim){response=deterministicSafeResponse(brief);action="REPLACED_OVERCLAIM";}
  else if(missingDisclosure){const disclosure=deterministicSafeResponse({...brief,facts:[],supported_external_context:[]});response=[original,disclosure].filter(Boolean).join("\n\n");action="APPENDED_REQUIRED_UNCERTAINTY";}
  return {
    result:{...source,response},
    enforcement:{contract:AVANTIQO_BUSINESS_ANSWER_EVIDENCE_BOUNDARY_CONTRACT,status:action,explanation_incomplete:explanationIncomplete,unresolved_count:unresolved.length,overclaim_detected:overclaim,required_uncertainty_appended:missingDisclosure&&!overclaim,authority_effect:"NONE"},
    authority_effect:"NONE",
  };
}

export const AvantiqoBusinessAnswerEvidenceBoundaryRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_ANSWER_EVIDENCE_BOUNDARY_CONTRACT,enforce:enforceBusinessAnswerEvidenceBoundary});
