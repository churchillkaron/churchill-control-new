import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const HUMAN_ATTENTION_REASONS = new Set([
  "CONTACT_CALLS_DISABLED",
  "CONTACT_MESSAGES_DISABLED",
  "CONTACT_DO_NOT_DISTURB",
  "SAFE_COMMUNICATION_CHANNEL_UNAVAILABLE",
  "FOLLOW_UP_CONTENT_NOT_SELF_CONTAINED",
  "OUTBOUND_CALL_FAILED",
  "OUTBOUND_CALL_CANCELLED",
  "SECRETARY_FOLLOW_UP_CONTACT_REQUIRED_FOR_CALL",
  "SECRETARY_FOLLOW_UP_CONTACT_PHONE_REQUIRED",
  "SECRETARY_FOLLOW_UP_PHONE_LINE_UNAVAILABLE",
]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

export function secretaryFollowUpExecutionNeedsHumanAttention(reason) {
  const normalized = text(reason, 2000).toUpperCase();
  if (!normalized) return false;
  return [...HUMAN_ATTENTION_REASONS].some(
    (candidate) => normalized === candidate || normalized.startsWith(`${candidate}:`),
  );
}

function humanMessage(reason, followUp) {
  const normalized = text(reason, 2000).toUpperCase();
  const action = text(followUp?.action_type, 40).toLowerCase() || "follow-up";
  if (normalized.startsWith("CONTACT_CALLS_DISABLED")) return "Avantiqo could not place this follow-up call because calls are disabled for this contact. Review the contact preference or handle the follow-up manually.";
  if (normalized.startsWith("CONTACT_MESSAGES_DISABLED")) return "Avantiqo could not send this follow-up because messages are disabled for this contact. Review the contact preference or handle the follow-up manually.";
  if (normalized.startsWith("CONTACT_DO_NOT_DISTURB")) return `Avantiqo could not execute this ${action} because the contact is permanently marked do-not-disturb. Human review is required.`;
  if (normalized.startsWith("SAFE_COMMUNICATION_CHANNEL_UNAVAILABLE")) return "Avantiqo has no safe existing communication channel for this contact. Connect or confirm a channel, or complete the follow-up manually.";
  if (normalized.startsWith("FOLLOW_UP_CONTENT_NOT_SELF_CONTAINED")) return "Avantiqo cannot complete this follow-up truthfully from the available evidence without inventing missing content. A human must provide the missing document, fact, decision, or instruction.";
  if (normalized.startsWith("OUTBOUND_CALL_FAILED")) return "The Secretary follow-up call failed. Review the contact/phone transport and retry or handle the call manually.";
  if (normalized.startsWith("OUTBOUND_CALL_CANCELLED")) return "The Secretary follow-up call was cancelled before completion. Review and decide whether to retry manually.";
  if (normalized.startsWith("SECRETARY_FOLLOW_UP_CONTACT_REQUIRED_FOR_CALL")) return "This follow-up requires a call but no canonical contact is attached. Add or select the contact before retrying.";
  if (normalized.startsWith("SECRETARY_FOLLOW_UP_CONTACT_PHONE_REQUIRED")) return "This follow-up requires a call but the contact has no usable phone number. Add a phone number or handle it another way.";
  if (normalized.startsWith("SECRETARY_FOLLOW_UP_PHONE_LINE_UNAVAILABLE")) return "Avantiqo has no active outbound Secretary phone line available for this follow-up. Restore the in-house phone transport or handle the call manually.";
  return `Avantiqo could not complete this ${action} automatically. Human review is required: ${text(reason, 1000)}`;
}

export async function escalateSecretaryFollowUpExecution({ execution, reason } = {}) {
  const organizationId = text(execution?.organization_id, 120);
  const followUpId = text(execution?.follow_up_id, 120);
  const executionId = text(execution?.id, 120);
  const blocker = text(reason || execution?.last_error, 2000);
  if (!organizationId || !followUpId || !executionId || !secretaryFollowUpExecutionNeedsHumanAttention(blocker)) {
    return { status: "not_required" };
  }

  const followUp = await one(
    supabaseAdmin
      .from("secretary_follow_ups")
      .select("id,organization_id,owner_party_id,contact_party_id,action_type,reason,status,due_at,metadata")
      .eq("organization_id", organizationId)
      .eq("id", followUpId)
      .maybeSingle(),
  );
  if (!followUp || followUp.status !== "PENDING") return { status: "not_required" };

  const dedupeKey = `follow_up:${followUp.id}:${followUp.due_at}`;
  const existing = await one(
    supabaseAdmin
      .from("secretary_alerts")
      .select("id,status,metadata")
      .eq("organization_id", organizationId)
      .eq("dedupe_key", dedupeKey)
      .maybeSingle(),
  );

  const metadata = {
    ...object(existing?.metadata),
    action_type: followUp.action_type,
    execution_blocked: true,
    execution_blocker: blocker,
    secretary_follow_up_execution_id: executionId,
    human_action_required: true,
    escalated_at: new Date().toISOString(),
    external_authority_used: false,
  };

  if (existing?.id) {
    const updated = await one(
      supabaseAdmin
        .from("secretary_alerts")
        .update({
          title: `Secretary needs help: ${text(followUp.reason, 500)}`,
          message: humanMessage(blocker, followUp),
          priority: "HIGH",
          due_at: followUp.due_at,
          status: "PENDING",
          seen_at: null,
          resolved_at: null,
          metadata,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", organizationId)
        .eq("id", existing.id)
        .select("*")
        .single(),
    );
    return { status: "escalated", replayed: true, alert: updated };
  }

  const inserted = await one(
    supabaseAdmin
      .from("secretary_alerts")
      .insert({
        organization_id: organizationId,
        owner_party_id: followUp.owner_party_id || null,
        contact_party_id: followUp.contact_party_id || null,
        alert_kind: "FOLLOW_UP",
        source_id: followUp.id,
        dedupe_key: dedupeKey,
        title: `Secretary needs help: ${text(followUp.reason, 500)}`,
        message: humanMessage(blocker, followUp),
        priority: "HIGH",
        due_at: followUp.due_at,
        status: "PENDING",
        metadata,
      })
      .select("*")
      .single(),
  );
  return { status: "escalated", replayed: false, alert: inserted };
}

export default escalateSecretaryFollowUpExecution;
