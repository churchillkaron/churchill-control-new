import { createHash } from "node:crypto";
import { sealBusinessDiagnosisProofAuthenticity, verifyBusinessDiagnosisProofAuthenticity } from "./AvantiqoBusinessDiagnosisProofAuthenticityRuntime.js";

export const AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_CONTRACT = "AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_V2";
const AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_V1 = "AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_V1";
export const BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_ERROR_CODE = "BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_FAILURE";
export const AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_CONTRACT = "AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_V4";
const AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_V3 = "AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_V3";
const AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_V2 = "AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_V2";

export function businessDiagnosisProofIntegrityError(stage="LIVE_RETURN"){
  const error=new Error("Business diagnosis proof verification failed");
  error.code=BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_ERROR_CODE;
  error.status=500;
  error.details={code:BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_ERROR_CODE,stage:String(stage||"LIVE_RETURN"),retryable:true,authority_effect:"NONE"};
  return error;
}

const list=(v)=>Array.isArray(v)?v:[];
const text=(v,n=1000)=>String(v??"").trim().slice(0,n);
function canonicalValue(value){
  if(Array.isArray(value)) return value.map(canonicalValue);
  if(value&&typeof value==="object"){
    return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,canonicalValue(value[key])]));
  }
  return value;
}
const stable=(v)=>JSON.stringify(canonicalValue(v));
const sortedUnique=(values=[])=>[...new Set(list(values).map((v)=>text(v,160)).filter(Boolean))].sort();
const sha=(v)=>createHash("sha256").update(String(v??"")).digest("hex");
export function businessDiagnosisAnswerContentFingerprint(value){return sha(String(value??"").trim());}


export function buildBusinessDiagnosisAuditProjection({
  receipt_fingerprint=null, receipt_contract=null, diagnosis_class=null, business_timezone=null, answer_content_fingerprint=null, final_evidence_state=null, residual_material=false,
  answer_boundary_status=null, answer_unsupported_recommendation_outcome_detected=false,
  validated_external_context_count=0, unresolved_external_context_count=0,
  baseline_period_id=null, baseline_period_start_date=null, baseline_period_end_date=null,
  current_period_id=null, current_period_start_date=null, current_period_end_date=null,
}={}){
  return {
    projection_contract:AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_CONTRACT,
    receipt_fingerprint:text(receipt_fingerprint,128)||null,
    receipt_contract:text(receipt_contract,160)||null,
    diagnosis_class:text(diagnosis_class,120)||null,
    business_timezone:text(business_timezone,160)||null,
    answer_content_fingerprint:text(answer_content_fingerprint,128)||null,
    final_evidence_state:text(final_evidence_state,160)||null,
    residual_material:residual_material===true,
    answer_boundary_status:text(answer_boundary_status,160)||null,
    answer_unsupported_recommendation_outcome_detected:answer_unsupported_recommendation_outcome_detected===true,
    validated_external_context_count:Number.isFinite(Number(validated_external_context_count))?Number(validated_external_context_count):0,
    unresolved_external_context_count:Number.isFinite(Number(unresolved_external_context_count))?Number(unresolved_external_context_count):0,
    periods:{
      baseline_period_id:text(baseline_period_id,120)||null,
      baseline_start_date:text(baseline_period_start_date,40)||null,
      baseline_end_date:text(baseline_period_end_date,40)||null,
      current_period_id:text(current_period_id,120)||null,
      current_start_date:text(current_period_start_date,40)||null,
      current_end_date:text(current_period_end_date,40)||null,
    },
    authority_effect:"NONE",
  };
}

function buildV3BusinessDiagnosisAuditProjection({
  receipt_fingerprint=null, diagnosis_class=null, business_timezone=null, answer_content_fingerprint=null, final_evidence_state=null, residual_material=false,
  answer_boundary_status=null, answer_unsupported_recommendation_outcome_detected=false,
  validated_external_context_count=0, unresolved_external_context_count=0,
  baseline_period_id=null, baseline_period_start_date=null, baseline_period_end_date=null,
  current_period_id=null, current_period_start_date=null, current_period_end_date=null,
}={}){
  return {
    projection_contract:AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_V3,
    receipt_fingerprint:text(receipt_fingerprint,128)||null,
    diagnosis_class:text(diagnosis_class,120)||null,
    business_timezone:text(business_timezone,160)||null,
    answer_content_fingerprint:text(answer_content_fingerprint,128)||null,
    final_evidence_state:text(final_evidence_state,160)||null,
    residual_material:residual_material===true,
    answer_boundary_status:text(answer_boundary_status,160)||null,
    answer_unsupported_recommendation_outcome_detected:answer_unsupported_recommendation_outcome_detected===true,
    validated_external_context_count:Number.isFinite(Number(validated_external_context_count))?Number(validated_external_context_count):0,
    unresolved_external_context_count:Number.isFinite(Number(unresolved_external_context_count))?Number(unresolved_external_context_count):0,
    periods:{
      baseline_period_id:text(baseline_period_id,120)||null,
      baseline_start_date:text(baseline_period_start_date,40)||null,
      baseline_end_date:text(baseline_period_end_date,40)||null,
      current_period_id:text(current_period_id,120)||null,
      current_start_date:text(current_period_start_date,40)||null,
      current_end_date:text(current_period_end_date,40)||null,
    },
    authority_effect:"NONE",
  };
}

function buildV2BusinessDiagnosisAuditProjection({
  receipt_fingerprint=null, diagnosis_class=null, business_timezone=null, final_evidence_state=null, residual_material=false,
  answer_boundary_status=null, answer_unsupported_recommendation_outcome_detected=false,
  validated_external_context_count=0, unresolved_external_context_count=0,
  baseline_period_id=null, baseline_period_start_date=null, baseline_period_end_date=null,
  current_period_id=null, current_period_start_date=null, current_period_end_date=null,
}={}){
  return {
    projection_contract:AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_V2,
    receipt_fingerprint:text(receipt_fingerprint,128)||null,
    diagnosis_class:text(diagnosis_class,120)||null,
    business_timezone:text(business_timezone,160)||null,
    final_evidence_state:text(final_evidence_state,160)||null,
    residual_material:residual_material===true,
    answer_boundary_status:text(answer_boundary_status,160)||null,
    answer_unsupported_recommendation_outcome_detected:answer_unsupported_recommendation_outcome_detected===true,
    validated_external_context_count:Number.isFinite(Number(validated_external_context_count))?Number(validated_external_context_count):0,
    unresolved_external_context_count:Number.isFinite(Number(unresolved_external_context_count))?Number(unresolved_external_context_count):0,
    periods:{
      baseline_period_id:text(baseline_period_id,120)||null,
      baseline_start_date:text(baseline_period_start_date,40)||null,
      baseline_end_date:text(baseline_period_end_date,40)||null,
      current_period_id:text(current_period_id,120)||null,
      current_start_date:text(current_period_start_date,40)||null,
      current_end_date:text(current_period_end_date,40)||null,
    },
    authority_effect:"NONE",
  };
}

function buildLegacyBusinessDiagnosisAuditProjection(input={}){
  const v2=buildV2BusinessDiagnosisAuditProjection(input);
  const {projection_contract,...legacy}=v2;
  return legacy;
}

function v3BusinessDiagnosisAuditProjectionFingerprint(input={}){
  return sha(stable(buildV3BusinessDiagnosisAuditProjection(input)));
}

function v2BusinessDiagnosisAuditProjectionFingerprint(input={}){
  return sha(stable(buildV2BusinessDiagnosisAuditProjection(input)));
}

function legacyBusinessDiagnosisAuditProjectionFingerprint(input={}){
  return sha(stable(buildLegacyBusinessDiagnosisAuditProjection(input)));
}

export function businessDiagnosisAuditProjectionFingerprint(input={}){
  return sha(stable(buildBusinessDiagnosisAuditProjection(input)));
}

export function buildBusinessDiagnosisAuditProjectionFromReceipt(receipt={}){
  return buildBusinessDiagnosisAuditProjection({
    receipt_fingerprint:receipt?.receipt_fingerprint,
    receipt_contract:receipt?.contract||receipt?.receipt_contract,
    diagnosis_class:receipt?.diagnosis_class,
    business_timezone:receipt?.business_timezone,
    answer_content_fingerprint:receipt?.answer_content_fingerprint,
    final_evidence_state:receipt?.final_evidence_state,
    residual_material:receipt?.residual_material,
    answer_boundary_status:receipt?.answer_boundary_status,
    answer_unsupported_recommendation_outcome_detected:receipt?.answer_unsupported_recommendation_outcome_detected,
    validated_external_context_count:list(receipt?.validated_external_context_ids).length,
    unresolved_external_context_count:list(receipt?.rejected_or_unresolved_external_contexts).length,
    baseline_period_id:receipt?.baseline_period_id,
    baseline_period_start_date:receipt?.baseline_period_start_date,
    baseline_period_end_date:receipt?.baseline_period_end_date,
    current_period_id:receipt?.current_period_id,
    current_period_start_date:receipt?.current_period_start_date,
    current_period_end_date:receipt?.current_period_end_date,
  });
}

export function verifyBusinessDiagnosisAnswerContent(evidence={},answerContent=""){
  const projectionContract=text(evidence?.audit_projection_contract,160)||null;
  const answerBound=projectionContract===AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_CONTRACT||projectionContract===AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_V3;
  if(!answerBound){
    return {status:"LEGACY_NOT_BOUND",verified:true,projection_contract:projectionContract};
  }
  const expected=text(evidence?.answer_content_fingerprint,128)||null;
  if(!expected) return {status:"ANSWER_FINGERPRINT_MISSING",verified:false,projection_contract:projectionContract};
  const actual=businessDiagnosisAnswerContentFingerprint(answerContent);
  return {status:actual===expected?"VERIFIED":"MISMATCH",verified:actual===expected,expected_fingerprint:expected,actual_fingerprint:actual,projection_contract:projectionContract};
}

export function verifyBusinessDiagnosisReceiptContract(evidence={}){
  const projectionContract=text(evidence?.audit_projection_contract,160)||null;
  const receiptContract=text(evidence?.receipt_contract,160)||null;
  if(projectionContract===AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_CONTRACT){
    if(!receiptContract) return {status:"RECEIPT_CONTRACT_MISSING",verified:false,receipt_contract:null,projection_contract:projectionContract};
    if(receiptContract!==AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_CONTRACT){
      return {status:receiptContract===AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_V1?"RECEIPT_PROJECTION_VERSION_MISMATCH":"UNSUPPORTED_RECEIPT_VERSION",verified:false,receipt_contract:receiptContract,projection_contract:projectionContract};
    }
    return {status:"VERIFIED",verified:true,receipt_contract:receiptContract,projection_contract:projectionContract};
  }
  if(projectionContract===AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_V3||projectionContract===AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_V2||!projectionContract){
    if(!receiptContract||receiptContract===AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_V1){
      return {status:"VERIFIED_LEGACY",verified:true,receipt_contract:receiptContract,projection_contract:projectionContract};
    }
    return {status:receiptContract===AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_CONTRACT?"RECEIPT_PROJECTION_VERSION_MISMATCH":"UNSUPPORTED_RECEIPT_VERSION",verified:false,receipt_contract:receiptContract,projection_contract:projectionContract};
  }
  return {status:"UNSUPPORTED_VERSION",verified:false,receipt_contract:receiptContract,projection_contract:projectionContract};
}

export function verifyBusinessDiagnosisAuditProjection(evidence={}){
  const fingerprint=text(evidence?.audit_projection_fingerprint,128)||null;
  if(!fingerprint) return {status:"NOT_AVAILABLE",verified:false};
  const receiptVerification=verifyBusinessDiagnosisReceiptContract(evidence);
  if(!receiptVerification.verified) return {...receiptVerification,expected_fingerprint:null};
  const periods=evidence?.periods&&typeof evidence.periods==="object"?evidence.periods:{};
  const input={
    receipt_fingerprint:evidence?.receipt_fingerprint,
    receipt_contract:evidence?.receipt_contract,
    diagnosis_class:evidence?.class||evidence?.diagnosis_class,
    business_timezone:evidence?.business_timezone,
    answer_content_fingerprint:evidence?.answer_content_fingerprint,
    final_evidence_state:evidence?.final_evidence_state,
    residual_material:evidence?.residual_material,
    answer_boundary_status:evidence?.answer_boundary_status,
    answer_unsupported_recommendation_outcome_detected:evidence?.answer_unsupported_recommendation_outcome_detected,
    validated_external_context_count:evidence?.validated_external_context_count,
    unresolved_external_context_count:evidence?.unresolved_external_context_count,
    baseline_period_id:periods?.baseline_period_id,
    baseline_period_start_date:periods?.baseline_start_date,
    baseline_period_end_date:periods?.baseline_end_date,
    current_period_id:periods?.current_period_id,
    current_period_start_date:periods?.current_start_date,
    current_period_end_date:periods?.current_end_date,
  };
  const projectionContract=text(evidence?.audit_projection_contract,160)||null;
  if(!projectionContract){
    const legacyExpected=legacyBusinessDiagnosisAuditProjectionFingerprint(input);
    return {status:legacyExpected===fingerprint?"VERIFIED_LEGACY":"MISMATCH",verified:legacyExpected===fingerprint,expected_fingerprint:legacyExpected,projection_contract:null,receipt_verification_status:receiptVerification.status};
  }
  if(projectionContract===AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_V3){
    const legacyExpected=v3BusinessDiagnosisAuditProjectionFingerprint(input);
    return {status:legacyExpected===fingerprint?"VERIFIED_LEGACY":"MISMATCH",verified:legacyExpected===fingerprint,expected_fingerprint:legacyExpected,projection_contract:projectionContract,receipt_verification_status:receiptVerification.status};
  }
  if(projectionContract===AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_V2){
    const legacyExpected=v2BusinessDiagnosisAuditProjectionFingerprint(input);
    return {status:legacyExpected===fingerprint?"VERIFIED_LEGACY":"MISMATCH",verified:legacyExpected===fingerprint,expected_fingerprint:legacyExpected,projection_contract:projectionContract,receipt_verification_status:receiptVerification.status};
  }
  if(projectionContract!==AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_CONTRACT){
    return {status:"UNSUPPORTED_VERSION",verified:false,projection_contract:projectionContract};
  }
  const expected=businessDiagnosisAuditProjectionFingerprint(input);
  return {status:expected===fingerprint?"VERIFIED":"MISMATCH",verified:expected===fingerprint,expected_fingerprint:expected,projection_contract:projectionContract,receipt_verification_status:receiptVerification.status};
}

function sourceRefs(closure={}){
  return list(closure?.causal_evidence).flatMap((row)=>list(row?.source_refs).map((source)=>({
    context_id:text(row?.context_id,160)||null,
    url:text(source?.url,2000)||null,
    publisher:text(source?.publisher,240)||null,
    independence_group:text(source?.independence_group,240)||null,
    observed_at:text(source?.observed_at,120)||null,
  }))).filter((row)=>row.url).sort((a,b)=>`${a.context_id||""}\u0000${a.url||""}\u0000${a.publisher||""}\u0000${a.independence_group||""}\u0000${a.observed_at||""}`.localeCompare(`${b.context_id||""}\u0000${b.url||""}\u0000${b.publisher||""}\u0000${b.independence_group||""}\u0000${b.observed_at||""}`));
}

export function buildBusinessDiagnosisReceipt({organization_id=null,entity_id=null,metric=null,diagnosis_class=null,business_timezone=null,answer_content=null,baseline_period_id=null,baseline_period_start_date=null,baseline_period_end_date=null,current_period_id=null,current_period_start_date=null,current_period_end_date=null,final_diagnosis=null,external_research_plan=null,external_evidence_assessment=null,external_diagnosis_closure=null,answer_brief=null,answer_boundary=null}={}){
  const diagnosis=final_diagnosis?.diagnosis||null;
  const payload={
    contract:AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_CONTRACT,
    organization_id:text(organization_id,160)||null,
    entity_id:text(entity_id,160)||null,
    metric:text(metric||final_diagnosis?.metric,120)||null,
    diagnosis_class:text(diagnosis_class,120)||null,
    business_timezone:text(business_timezone,160)||null,
    answer_content_fingerprint:businessDiagnosisAnswerContentFingerprint(answer_content),
    baseline_period_id:text(baseline_period_id,120)||null,
    baseline_period_start_date:text(baseline_period_start_date,40)||null,
    baseline_period_end_date:text(baseline_period_end_date,40)||null,
    current_period_id:text(current_period_id,120)||null,
    current_period_start_date:text(current_period_start_date,40)||null,
    current_period_end_date:text(current_period_end_date,40)||null,
    final_evidence_state:text(diagnosis?.final_evidence_state,160)||null,
    target_metric_status:text(diagnosis?.target_metric?.status,160)||null,
    residual_material:diagnosis?.residual_material===true,
    residual_ratio:Number.isFinite(Number(diagnosis?.residual_ratio))?Number(diagnosis.residual_ratio):null,
    unexplained_residual:Number.isFinite(Number(diagnosis?.variance?.unexplained_residual))?Number(diagnosis.variance.unexplained_residual):null,
    internal_coverage_incomplete:diagnosis?.internal_coverage_incomplete===true,
    supported_external_context_ids:sortedUnique(diagnosis?.causal?.supported_context_ids),
    external_research_status:text(external_research_plan?.status,160)||null,
    external_assessment_status:text(external_evidence_assessment?.status,160)||null,
    validated_external_context_ids:sortedUnique(external_diagnosis_closure?.validated_context_ids),
    rejected_or_unresolved_external_contexts:list(external_diagnosis_closure?.validation_results).filter((row)=>row?.status!=="CAUSAL_EVIDENCE_READY").map((row)=>({context_id:text(row?.context_id,160)||null,status:text(row?.status,160)||null,reason:text(row?.reason,240)||null,missing_requirements:sortedUnique(row?.missing_requirements)})).sort((a,b)=>`${a.context_id||""}\u0000${a.status||""}\u0000${a.reason||""}`.localeCompare(`${b.context_id||""}\u0000${b.status||""}\u0000${b.reason||""}`)),
    source_refs:sourceRefs(external_diagnosis_closure),
    answer_brief_status:text(answer_brief?.status,160)||null,
    unresolved_answer_item_count:list(answer_brief?.unresolved).length,
    answer_boundary_status:text(answer_boundary?.status,160)||null,
    answer_overclaim_detected:answer_boundary?.overclaim_detected===true,
    answer_unsupported_recommendation_outcome_detected:answer_boundary?.unsupported_recommendation_outcome_detected===true,
    answer_uncertainty_appended:answer_boundary?.required_uncertainty_appended===true,
    read_only:true,
    raw_web_content_persisted:false,
    raw_reasoning_persisted:false,
    automatic_monetary_attribution:false,
    authority_effect:"NONE",
  };
  const fingerprint=sha(stable(payload));
  const auditProjectionFingerprint=businessDiagnosisAuditProjectionFingerprint({
    receipt_fingerprint:fingerprint,receipt_contract:payload.contract,diagnosis_class:payload.diagnosis_class,business_timezone:payload.business_timezone,answer_content_fingerprint:payload.answer_content_fingerprint,final_evidence_state:payload.final_evidence_state,residual_material:payload.residual_material,
    answer_boundary_status:payload.answer_boundary_status,answer_unsupported_recommendation_outcome_detected:payload.answer_unsupported_recommendation_outcome_detected,
    validated_external_context_count:payload.validated_external_context_ids.length,unresolved_external_context_count:payload.rejected_or_unresolved_external_contexts.length,
    baseline_period_id:payload.baseline_period_id,baseline_period_start_date:payload.baseline_period_start_date,baseline_period_end_date:payload.baseline_period_end_date,
    current_period_id:payload.current_period_id,current_period_start_date:payload.current_period_start_date,current_period_end_date:payload.current_period_end_date,
  });
  const proofBase={...payload,receipt_fingerprint:fingerprint,audit_projection_contract:AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_CONTRACT,audit_projection_fingerprint:auditProjectionFingerprint};
  const authenticity=sealBusinessDiagnosisProofAuthenticity({
    receipt_contract:proofBase.contract,
    receipt_fingerprint:proofBase.receipt_fingerprint,
    audit_projection_contract:proofBase.audit_projection_contract,
    audit_projection_fingerprint:proofBase.audit_projection_fingerprint,
    answer_content_fingerprint:proofBase.answer_content_fingerprint,
  });
  return {...proofBase,...(authenticity.sealed?authenticity.proof:{authenticity_status:authenticity.status,authenticity_reason:authenticity.reason})};
}

export const AvantiqoBusinessDiagnosisReceiptRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_CONTRACT,legacyContract:AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_V1,build:buildBusinessDiagnosisReceipt,auditProjectionContract:AVANTIQO_BUSINESS_DIAGNOSIS_AUDIT_PROJECTION_CONTRACT,answerFingerprint:businessDiagnosisAnswerContentFingerprint,verifyAnswer:verifyBusinessDiagnosisAnswerContent,verifyReceipt:verifyBusinessDiagnosisReceiptContract,verifyAuthenticity:verifyBusinessDiagnosisProofAuthenticity,auditProjection:buildBusinessDiagnosisAuditProjection,auditProjectionFromReceipt:buildBusinessDiagnosisAuditProjectionFromReceipt,auditFingerprint:businessDiagnosisAuditProjectionFingerprint,verifyAudit:verifyBusinessDiagnosisAuditProjection});
