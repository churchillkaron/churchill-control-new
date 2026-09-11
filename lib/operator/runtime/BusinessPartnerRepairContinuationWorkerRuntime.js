import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveDelegatedOrganizationAccess } from "@/lib/platform/security/resolveDelegatedOrganizationAccess";
import { verifyExistingProductionDeployment } from "@/lib/platform/runtime/AvantiqoProductionReleaseRuntime";
import { runSyntheticIntelligenceTurn } from "./SyntheticIntelligenceTurnRuntime";
import { persistAssistantTurnAndConversationState } from "./IntelligenceConversationRuntime";

export const BUSINESS_PARTNER_REPAIR_CONTINUATION_WORKER_CONTRACT = "AVANTIQO_BUSINESS_PARTNER_REPAIR_CONTINUATION_WORKER_V1";
const LEASE_MS = 5 * 60 * 1000;
const text=(v,n=4000)=>String(v??"").trim().slice(0,n);
const object=(v)=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};
const list=(v)=>Array.isArray(v)?v:[];

function recoveryFrom(row){ return object(object(row?.agreement_state).business_partner_recovery); }
function eligibleRecovery(recovery){
  const wake=object(recovery.repair_continuation_wake);
  if (text(wake.status,80)==="BLOCKED") return false;
  return text(recovery.contract,180)==="AVANTIQO_BUSINESS_PARTNER_RECOVERY_STATE_V1" &&
    recovery.replay_required===true && Boolean(text(recovery.execution_key,160)) &&
    (recovery.resume_authorized===true || recovery.deployment_pending===true);
}
function leaseAvailable(recovery){
  const wake=object(recovery.repair_continuation_wake);
  if (text(wake.status,80)!=="RESUMING") return true;
  const expires=Date.parse(text(wake.expires_at,80));
  return !Number.isFinite(expires) || expires<=Date.now();
}

async function claimConversation(row){
  const recovery=recoveryFrom(row);
  if (!eligibleRecovery(recovery) || !leaseAvailable(recovery)) return null;
  const token=crypto.randomUUID();
  const now=new Date();
  const agreement={...object(row.agreement_state),business_partner_recovery:{...recovery,repair_continuation_wake:{
    contract:"AVANTIQO_BUSINESS_PARTNER_REPAIR_CONTINUATION_WAKE_V1", status:"RESUMING", token,
    execution_key:text(recovery.execution_key,160), claimed_at:now.toISOString(), expires_at:new Date(now.getTime()+LEASE_MS).toISOString(),
    attempt_count:Number(object(recovery.repair_continuation_wake).attempt_count||0)+1, authorization_effect:"NONE",
  }}};
  const updated=await supabaseAdmin.from("intelligence_conversations").update({agreement_state:agreement,updated_at:now.toISOString()})
    .eq("id",row.id).eq("organization_id",row.organization_id).eq("status","ACTIVE").eq("updated_at",row.updated_at)
    .select("id,organization_id,party_id,entity_id,period_id,created_by_user_id,agreement_state,project_state,updated_at").maybeSingle();
  if (updated.error) throw updated.error;
  return updated.data ? {row:updated.data,token} : null;
}

async function releaseClaim(row, token, patch={}){
  const recovery=recoveryFrom(row); const wake=object(recovery.repair_continuation_wake);
  if (text(wake.token,160)!==text(token,160)) return null;
  const nextRecovery={...recovery,...patch,repair_continuation_wake:{...wake,status:text(patch.wake_status,80)||"WAITING",token:null,expires_at:null,updated_at:new Date().toISOString(),authorization_effect:"NONE"}};
  delete nextRecovery.wake_status;
  const agreement={...object(row.agreement_state),business_partner_recovery:nextRecovery};
  const updated=await supabaseAdmin.from("intelligence_conversations").update({agreement_state:agreement,updated_at:new Date().toISOString()})
    .eq("id",row.id).eq("organization_id",row.organization_id).eq("status","ACTIVE").eq("updated_at",row.updated_at).select("*").maybeSingle();
  if (updated.error) throw updated.error; return updated.data||null;
}

async function updateClaimedRecovery(row, token, patch={}){
  const recovery=recoveryFrom(row); const wake=object(recovery.repair_continuation_wake);
  if (text(wake.token,160)!==text(token,160) || text(wake.status,80)!=="RESUMING") return null;
  const agreement={...object(row.agreement_state),business_partner_recovery:{...recovery,...patch,repair_continuation_wake:wake}};
  const updated=await supabaseAdmin.from("intelligence_conversations").update({agreement_state:agreement,updated_at:new Date().toISOString()})
    .eq("id",row.id).eq("organization_id",row.organization_id).eq("status","ACTIVE").eq("updated_at",row.updated_at)
    .select("id,organization_id,party_id,entity_id,period_id,created_by_user_id,agreement_state,project_state,updated_at").maybeSingle();
  if (updated.error) throw updated.error; return updated.data||null;
}

async function reloadClaimedConversation(row, token){
  const loaded=await supabaseAdmin.from("intelligence_conversations")
    .select("id,organization_id,party_id,entity_id,period_id,created_by_user_id,agreement_state,project_state,updated_at,status")
    .eq("id",row.id).eq("organization_id",row.organization_id).maybeSingle();
  if (loaded.error) throw loaded.error;
  const current=loaded.data; if (!current || text(current.status,40)!=="ACTIVE") return null;
  const recovery=recoveryFrom(current); const wake=object(recovery.repair_continuation_wake);
  if (text(wake.status,80)!=="RESUMING" || text(wake.token,160)!==text(token,160)) return null;
  if (text(wake.execution_key,160)!==text(recovery.execution_key,160)) return null;
  return current;
}

async function ensureActivation(row, token){
  const recovery=recoveryFrom(row);
  if (recovery.production_deploy_performed===true && recovery.activation_verified===true && recovery.resume_authorized===true) return row;
  const release=object(recovery.production_release); const commit=object(release.commit); const deployment=object(release.deployment);
  const deploymentId=text(deployment.deployment_id,300); const commitSha=text(commit.commit_sha||deployment.requested_commit_sha,80);
  if (!deploymentId || !commitSha) return releaseClaim(row,token,{wake_status:"BLOCKED",resume_authorized:false,status:"REPAIR_RELEASE_EVIDENCE_INCOMPLETE"});
  const verified=await verifyExistingProductionDeployment({deployment_id:deploymentId,expected_commit_sha:commitSha});
  if (verified.production_deployed!==true) return releaseClaim(row,token,{wake_status:"WAITING_DEPLOYMENT",deployment_pending:true,resume_authorized:false,production_release:{...release,deployment:verified}});
  return updateClaimedRecovery(row,token,{deployment_pending:false,production_deploy_performed:true,activation_verified:true,resume_authorized:true,production_release:{...release,deployment:verified}});
}

export async function processBusinessPartnerRepairContinuation(candidate){
  const claimed=await claimConversation(candidate);
  if (!claimed) return {success:true,skipped:true,reason:"RECOVERY_NOT_CLAIMED",conversation_id:candidate.id};
  let active=claimed.row;
  try {
    active=await ensureActivation(active,claimed.token);
    if (!active) return {success:true,skipped:true,reason:"RECOVERY_CLAIM_LOST",conversation_id:candidate.id};
    active=await reloadClaimedConversation(active,claimed.token);
    if (!active) return {success:true,skipped:true,reason:"RECOVERY_CHANGED_AFTER_CLAIM",conversation_id:candidate.id};
    const recovery=recoveryFrom(active);
    if (recovery.resume_authorized!==true || recovery.activation_verified!==true) return {success:true,skipped:true,reason:"PRODUCTION_ACTIVATION_NOT_READY",conversation_id:active.id};
    const userId=text(active.created_by_user_id,160); const access=await resolveDelegatedOrganizationAccess({organizationId:active.organization_id,userId});
    if (text(access.partyId,160)!==text(active.party_id,160)) throw new Error("BUSINESS_PARTNER_REPAIR_CONTINUATION_PARTY_MISMATCH");
    const result=await runSyntheticIntelligenceTurn({organizationId:active.organization_id,entityId:active.entity_id||null,periodId:active.period_id||null,partyId:active.party_id,
      actor:access.actor,role:access.role,permissions:list(access.permissions),message:"continue",source:"event",pathname:null,
      agreementState:object(active.agreement_state),projectState:object(active.project_state),conversation:[],longTermMemory:[],conversationAttachments:[],callerRequest:null,conversationId:active.id});
    const responseText=text(result?.decision?.response_text,12000)||"The verified production repair activated and Business Partner continued the original mission.";
    const nextAgreement=object(result?.agreement_state||result?.decision?.agreement_state||active.agreement_state); const nextProject=object(result?.decision?.project_state||active.project_state);
    await persistAssistantTurnAndConversationState({organizationId:active.organization_id,conversationId:active.id,partyId:active.party_id,source:"event",content:responseText,
      decision:{...object(result?.decision),agreement_state:nextAgreement,project_state:nextProject},evidence:{repair_continuation:{execution_key:text(recovery.execution_key,160),authorization_effect:"NONE"}},
      execution:object(result?.execution),navigation:object(result?.navigation),agreementState:nextAgreement,projectState:nextProject});
    return {success:true,skipped:false,conversation_id:active.id,execution_status:text(result?.execution?.status,100)||null};
  } catch(error){
    const attempts=Number(object(recoveryFrom(active).repair_continuation_wake).attempt_count||1);
    const retryable=attempts<5;
    await releaseClaim(active,claimed.token,{wake_status:retryable?"RETRY_PENDING":"BLOCKED",last_repair_continuation_error:text(error?.message||error,1000)}).catch(()=>null);
    return {success:false,skipped:false,retryable,conversation_id:candidate.id,error:text(error?.message||error,1000)};
  }
}

export async function runBusinessPartnerRepairContinuationBatch({limit=4}={}){
  const max=Math.max(1,Math.min(Number(limit)||4,12));
  const rows=await supabaseAdmin.from("intelligence_conversations").select("id,organization_id,party_id,entity_id,period_id,created_by_user_id,agreement_state,project_state,updated_at")
    .eq("status","ACTIVE").contains("agreement_state",{business_partner_recovery:{replay_required:true}}).order("updated_at",{ascending:true}).limit(max*4);
  if(rows.error) throw rows.error;
  const candidates=(rows.data||[]).filter(row=>eligibleRecovery(recoveryFrom(row))&&leaseAvailable(recoveryFrom(row))).slice(0,max);
  const results=[]; for(const row of candidates) results.push(await processBusinessPartnerRepairContinuation(row));
  return {success:results.every(r=>r.success!==false),processed_count:results.filter(r=>!r.skipped).length,failed_count:results.filter(r=>r.success===false).length,results};
}

export const BusinessPartnerRepairContinuationWorkerRuntime=Object.freeze({contract:BUSINESS_PARTNER_REPAIR_CONTINUATION_WORKER_CONTRACT,process:processBusinessPartnerRepairContinuation,runBatch:runBusinessPartnerRepairContinuationBatch});
