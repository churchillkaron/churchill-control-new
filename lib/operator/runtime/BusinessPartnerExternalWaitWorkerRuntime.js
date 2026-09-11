import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveDelegatedOrganizationAccess } from "@/lib/platform/security/resolveDelegatedOrganizationAccess";
import { runSyntheticIntelligenceTurn } from "./SyntheticIntelligenceTurnRuntime";
import { persistAssistantTurnAndConversationState } from "./IntelligenceConversationRuntime";

export const BUSINESS_PARTNER_EXTERNAL_WAIT_WORKER_CONTRACT = "AVANTIQO_BUSINESS_PARTNER_EXTERNAL_WAIT_WORKER_V1";
const TABLE = "business_partner_external_waits";
const LEASE_MS = 5 * 60 * 1000;
const text=(v,n=4000)=>String(v??"").trim().slice(0,n);
const object=(v)=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};
const list=(v)=>Array.isArray(v)?v:[];

async function claim(row) {
  const token=crypto.randomUUID();
  const now=new Date();
  const update=await supabaseAdmin.from(TABLE).update({
    status:"RESUMING", claim_token:token, claim_expires_at:new Date(now.getTime()+LEASE_MS).toISOString(),
    attempt_count:Number(row.attempt_count||0)+1, last_error:null, updated_at:now.toISOString(),
  }).eq("id",row.id).eq("organization_id",row.organization_id).eq("status","EVENT_RECEIVED").select("*").maybeSingle();
  if (update.error) throw update.error;
  return update.data ? {claimed:true, token, row:update.data} : {claimed:false, token:null, row:null};
}

async function conversationFor(wait) {
  if (!text(wait.conversation_id,160)) throw new Error("BUSINESS_PARTNER_EXTERNAL_WAIT_CONVERSATION_REQUIRED");
  const result=await supabaseAdmin.from("intelligence_conversations").select("id,organization_id,party_id,entity_id,period_id,conversation_key,status,created_by_user_id,agreement_state,project_state").eq("id",wait.conversation_id).eq("organization_id",wait.organization_id).eq("party_id",wait.party_id).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data || text(result.data.status,40).toUpperCase()!=="ACTIVE") throw new Error("BUSINESS_PARTNER_EXTERNAL_WAIT_CONVERSATION_NOT_ACTIVE");
  return result.data;
}

function activeWaitBinding(conversation, wait) {
  const agreement = object(conversation?.agreement_state);
  const run = object(agreement.autonomous_run);
  const pending = object(agreement.pending_execution);
  const resume = object(object(pending.payload).resume);
  const currentStep = list(run.planned_steps).find((step) => text(step?.id,180) === text(wait.step_id,180));
  const common =
    text(run.run_id,180) === text(wait.run_id,180) &&
    text(run.run_kind,40).toLowerCase() === "mission" &&
    text(run.current_step_id,180) === text(wait.step_id,180) &&
    text(pending.capability_key,300) === "platform.operator_mission.execute" &&
    text(pending.resume_kind,80).toLowerCase() === "mission" &&
    (!text(resume.run_id,180) || text(resume.run_id,180) === text(wait.run_id,180)) &&
    text(resume.current_step_id,180) === text(wait.step_id,180);
  if (!common) return false;

  const approvalRequestId = text(resume.approval_request_id,180);
  const approvalWait =
    text(wait.event_source,120) === "approval" &&
    ["APPROVAL_GRANTED", "APPROVAL_REJECTED"].includes(text(wait.event_type,180)) &&
    Boolean(approvalRequestId) &&
    text(wait.correlation_key,500) === `approval_request:${approvalRequestId}`;
  if (approvalWait) {
    return (
      text(run.status,80).toLowerCase() === "awaiting_approval" &&
      text(currentStep?.status,80).toLowerCase() === "awaiting_approval" &&
      text(currentStep?.approval_request_id,180) === approvalRequestId
    );
  }

  return (
    text(run.status,80).toLowerCase() === "waiting_external" &&
    text(currentStep?.status,80).toLowerCase() === "waiting_external"
  );
}

async function cancelApprovalSiblingWaits(wait) {
  if (text(wait.event_source,120) !== "approval") return;
  if (!["APPROVAL_GRANTED", "APPROVAL_REJECTED"].includes(text(wait.event_type,180))) return;
  await supabaseAdmin.from(TABLE).update({
    status:"CANCELLED",
    last_error:"APPROVAL_DECISION_ALREADY_RESUMED",
    continuation_result:{status:"CANCELLED_SIBLING_APPROVAL_WAIT",authorization_effect:"NONE"},
    updated_at:new Date().toISOString(),
  }).eq("organization_id",wait.organization_id)
    .eq("run_id",wait.run_id)
    .eq("step_id",wait.step_id)
    .eq("event_source","approval")
    .eq("correlation_key",wait.correlation_key)
    .eq("status","WAITING_EXTERNAL");
}

async function finish(wait, token, status, patch={}) {
  const update=await supabaseAdmin.from(TABLE).update({status,claim_token:null,claim_expires_at:null,updated_at:new Date().toISOString(),...patch}).eq("id",wait.id).eq("organization_id",wait.organization_id).eq("status","RESUMING").eq("claim_token",token).select("*").maybeSingle();
  if (update.error) throw update.error;
  return update.data || null;
}

export async function processBusinessPartnerExternalWait(wait) {
  const claimed=await claim(wait);
  if (!claimed.claimed) return {success:true,skipped:true,reason:"WAIT_ALREADY_CLAIMED_OR_CHANGED",wait_id:wait.id};
  const active=claimed.row;
  try {
    const conversation=await conversationFor(active);
    if (!activeWaitBinding(conversation, active)) {
      await finish(active, claimed.token, "CANCELLED", {
        last_error: "BUSINESS_PARTNER_EXTERNAL_WAIT_NO_LONGER_ACTIVE",
        continuation_result: { status: "CANCELLED_STALE_WAIT", authorization_effect: "NONE" },
      });
      return { success:true, skipped:true, reason:"WAIT_NO_LONGER_ACTIVE", wait_id:active.id };
    }
    const userId=text(conversation.created_by_user_id || active.actor_id,160);
    const access=await resolveDelegatedOrganizationAccess({organizationId:active.organization_id,userId});
    if (text(access.partyId,160)!==text(active.party_id,160)) throw new Error("BUSINESS_PARTNER_EXTERNAL_WAIT_PARTY_MISMATCH");
    const result=await runSyntheticIntelligenceTurn({
      organizationId:active.organization_id,
      entityId:active.entity_id || conversation.entity_id || null,
      periodId:active.period_id || conversation.period_id || null,
      partyId:active.party_id,
      actor:access.actor,
      role:access.role,
      permissions:list(access.permissions),
      message:"continue",
      source:"event",
      pathname:null,
      agreementState:object(conversation.agreement_state),
      projectState:object(conversation.project_state),
      conversation:[],
      longTermMemory:[],
      conversationAttachments:[],
      callerRequest:null,
      conversationId:conversation.id,
    });
    const responseText=text(result?.decision?.response_text,12000) || "External evidence arrived and the Business Partner mission continued under current governance.";
    const nextAgreement=object(result?.agreement_state || result?.decision?.agreement_state || conversation.agreement_state);
    const nextProject=object(result?.decision?.project_state || conversation.project_state);
    await persistAssistantTurnAndConversationState({
      organizationId:active.organization_id, conversationId:conversation.id, partyId:active.party_id,
      source:"event", content:responseText, decision:{...object(result?.decision),agreement_state:nextAgreement,project_state:nextProject},
      evidence:{external_wait:{wait_id:active.id,event_id:active.event_id,event_evidence:object(active.event_evidence),authorization_effect:"NONE"}},
      execution:object(result?.execution), navigation:object(result?.navigation), agreementState:nextAgreement, projectState:nextProject,
    });
    await finish(active,claimed.token,"RESUMED",{resumed_at:new Date().toISOString(),continuation_result:{status:text(result?.execution?.status,100)||null,response_text:responseText.slice(0,2000),authorization_effect:"NONE"}});
    await cancelApprovalSiblingWaits(active);
    return {success:true,skipped:false,wait_id:active.id,conversation_id:conversation.id,execution_status:text(result?.execution?.status,100)||null};
  } catch (error) {
    const retryable = Number(active.attempt_count || 0) < 5;
    await finish(active,claimed.token,retryable ? "EVENT_RECEIVED" : "BLOCKED",{
      last_error:text(error?.message||error,1000),
      continuation_result:{status:retryable ? "RETRY_PENDING" : "BLOCKED",authorization_effect:"NONE"},
    }).catch(()=>null);
    return {success:false,skipped:false,retryable,wait_id:active.id,error:text(error?.message||error,1000)};
  }
}

export async function runBusinessPartnerExternalWaitBatch({limit=4}={}) {
  const max=Math.max(1,Math.min(Number(limit)||4,12));
  const stale=new Date().toISOString();
  await supabaseAdmin.from(TABLE).update({status:"EVENT_RECEIVED",claim_token:null,claim_expires_at:null,updated_at:new Date().toISOString()}).eq("status","RESUMING").lt("claim_expires_at",stale);
  const rows=await supabaseAdmin.from(TABLE).select("*").eq("status","EVENT_RECEIVED").order("event_received_at",{ascending:true}).limit(max);
  if (rows.error) throw rows.error;
  const results=[];
  for (const row of rows.data||[]) results.push(await processBusinessPartnerExternalWait(row));
  return {success:results.every(r=>r.success!==false),processed_count:results.filter(r=>!r.skipped).length,failed_count:results.filter(r=>r.success===false).length,results};
}

export const BusinessPartnerExternalWaitWorkerRuntime=Object.freeze({contract:BUSINESS_PARTNER_EXTERNAL_WAIT_WORKER_CONTRACT,process:processBusinessPartnerExternalWait,runBatch:runBusinessPartnerExternalWaitBatch});
