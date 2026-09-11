import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const BUSINESS_PARTNER_EXTERNAL_WAIT_CONTRACT = "AVANTIQO_BUSINESS_PARTNER_EXTERNAL_WAIT_V1";
const TABLE = "business_partner_external_waits";
const text = (v, n=4000) => String(v ?? "").trim().slice(0,n);
const object = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};

function waitKey({ organization_id, run_id, step_id, event_source, event_type, correlation_key }) {
  return crypto.createHash("sha256").update([organization_id,run_id,step_id,event_source,event_type,correlation_key].map(v=>text(v,300)).join("|")).digest("hex");
}

export async function registerBusinessPartnerExternalWait({ context = {}, run, step, wait_for = {} } = {}) {
  const organizationId = text(context.organizationId || context.organization_id,160);
  const actorId = text(context?.actor?.id || context?.actor?.user_id,160);
  const partyId = text(context?.metadata?.partyId || context.partyId,160);
  const runId = text(run?.run_id,180); const stepId = text(step?.id,180);
  const source = text(wait_for.event_source,120); const eventType = text(wait_for.event_type,180);
  const correlationKey = text(wait_for.correlation_key,500);
  if (!organizationId || !actorId || !partyId || !runId || !stepId || !source || !eventType || !correlationKey) throw new Error("BUSINESS_PARTNER_EXTERNAL_WAIT_SCOPE_REQUIRED");
  const key = waitKey({organization_id:organizationId,run_id:runId,step_id:stepId,event_source:source,event_type:eventType,correlation_key:correlationKey});
  const row = {
    organization_id: organizationId, actor_id: actorId, party_id: partyId,
    entity_id: text(context.entityId,160)||null, period_id: text(context.periodId,160)||null,
    conversation_id: text(context?.metadata?.conversationId,160)||null,
    wait_key: key, run_id: runId, step_id: stepId, objective: text(run?.objective,1200)||null,
    event_source: source, event_type: eventType, correlation_key: correlationKey,
    mission_checkpoint: object(wait_for.mission_checkpoint), status: "WAITING_EXTERNAL",
    metadata: { contract: BUSINESS_PARTNER_EXTERNAL_WAIT_CONTRACT, authorization_effect:"NONE", ...object(wait_for.metadata) },
    updated_at: new Date().toISOString(),
  };
  const existing = await supabaseAdmin.from(TABLE).select("*").eq("organization_id", organizationId).eq("wait_key", key).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;
  const result = await supabaseAdmin.from(TABLE).insert(row).select("*").single();
  if (result.error) throw result.error;
  return result.data;
}

export async function consumeBusinessPartnerExternalEvent({ organization_id, event_source, event_type, correlation_key, event_id, evidence = {} } = {}) {
  const organizationId=text(organization_id,160), source=text(event_source,120), type=text(event_type,180), correlation=text(correlation_key,500), eventId=text(event_id,240);
  if (!organizationId || !source || !type || !correlation || !eventId) return {matched:0,resumptions:[]};
  const found = await supabaseAdmin.from(TABLE).select("*").eq("organization_id",organizationId).eq("status","WAITING_EXTERNAL").eq("event_source",source).eq("event_type",type).eq("correlation_key",correlation).limit(20);
  if (found.error) throw found.error;
  const resumptions=[];
  for (const row of found.data || []) {
    const update = await supabaseAdmin.from(TABLE).update({status:"EVENT_RECEIVED",event_id:eventId,event_evidence:object(evidence),event_received_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",row.id).eq("status","WAITING_EXTERNAL").select("*").maybeSingle();
    if (update.error) throw update.error;
    if (update.data) resumptions.push(update.data);
  }
  return {matched:resumptions.length,resumptions};
}


export async function registerBusinessPartnerRecoveryBackoffWait({ context = {}, recovery = {}, backoff = {} } = {}) {
  const current = object(recovery);
  const continuity = object(current.mission_continuity);
  const runId = text(continuity.run_id,180);
  const stepId = text(continuity.failed_step_id,180);
  const attempt = Number(object(backoff).attempt_count || 0);
  const retryNotBefore = text(object(backoff).retry_not_before,80);
  if (!runId || !stepId || !attempt || !retryNotBefore) throw new Error("BUSINESS_PARTNER_BACKOFF_WAIT_BINDING_REQUIRED");
  return registerBusinessPartnerExternalWait({
    context,
    run: { run_id: runId, objective: text(continuity.objective || current.original_goal,1200) },
    step: { id: stepId },
    wait_for: {
      event_source: "system:business_partner",
      event_type: "BACKOFF_DUE",
      correlation_key: `backoff:${runId}:${stepId}:${attempt}`,
      mission_checkpoint: { recovery_contract: text(current.contract,160), run_id: runId, step_id: stepId },
      metadata: {
        wait_kind: "EXTERNAL_BACKOFF",
        retry_not_before: retryNotBefore,
        backoff_attempt: attempt,
        mutation_replay_allowed: false,
      },
    },
  });
}

export const BusinessPartnerExternalWaitRuntime = Object.freeze({contract:BUSINESS_PARTNER_EXTERNAL_WAIT_CONTRACT, register:registerBusinessPartnerExternalWait, consumeEvent:consumeBusinessPartnerExternalEvent, registerBackoff:registerBusinessPartnerRecoveryBackoffWait});


export async function readBusinessPartnerExternalWait({ organization_id, wait_key } = {}) {
  const organizationId = text(organization_id,160), key = text(wait_key,128);
  if (!organizationId || !key) throw new Error("BUSINESS_PARTNER_EXTERNAL_WAIT_READ_SCOPE_REQUIRED");
  const result = await supabaseAdmin.from(TABLE).select("*").eq("organization_id",organizationId).eq("wait_key",key).maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}
