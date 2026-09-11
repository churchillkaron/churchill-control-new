import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { secretaryFollowUpRecoveryDirective, secretaryRecoveryMessage } from "@/lib/operator/secretary/SecretaryFollowUpRecoveryDirectiveRuntime";

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
  "SECRETARY_COVERAGE_ROUTING_REVIEW_REQUIRED",
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
  const directive = secretaryFollowUpRecoveryDirective({ reason, followUp });
  const action = text(followUp?.action_type, 40).toLowerCase() || "follow-up";
  return secretaryRecoveryMessage(directive, action);
}

function alertTitle(followUp, directive) {
  const prefix = directive?.needs_human_truth === true ? "Secretary needs one decision" : "Secretary recovery pending";
  return `${prefix}: ${text(followUp?.reason, 500)}`.slice(0, 700);
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
  const recoveryDirective = secretaryFollowUpRecoveryDirective({ reason: blocker, execution, followUp });

  const dedupeKey = `follow_up:${followUp.id}:${followUp.due_at}`;
  const existing = await one(
    supabaseAdmin
      .from("secretary_alerts")
      .select("id,status,metadata")
      .eq("organization_id", organizationId)
      .eq("dedupe_key", dedupeKey)
      .maybeSingle(),
  );

  const followUpMetadata = object(followUp.metadata);
  const metadata = {
    ...object(existing?.metadata),
    action_type: followUp.action_type,
    execution_blocked: true,
    execution_blocker: blocker,
    secretary_follow_up_execution_id: executionId,
    canonical_owner_party_id: followUpMetadata.canonical_owner_party_id || followUp.owner_party_id || null,
    operational_assignee_party_id: followUpMetadata.operational_assignee_party_id || null,
    secretary_coverage_id: followUpMetadata.secretary_coverage_id || null,
    secretary_coverage_scope: followUpMetadata.secretary_coverage_scope || null,
    secretary_coverage_routing_review_required: followUpMetadata.secretary_coverage_routing_review_required === true,
    human_action_required: recoveryDirective.needs_human_truth === true,
    business_partner_recovery: recoveryDirective,
    recovery_owner: "BUSINESS_PARTNER",
    manual_takeover_required: false,
    escalated_at: new Date().toISOString(),
    external_authority_used: false,
  };

  if (existing?.id) {
    const updated = await one(
      supabaseAdmin
        .from("secretary_alerts")
        .update({
          title: alertTitle(followUp, recoveryDirective),
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
        owner_party_id: followUpMetadata.canonical_owner_party_id || followUp.owner_party_id || null,
        contact_party_id: followUp.contact_party_id || null,
        alert_kind: "FOLLOW_UP",
        source_id: followUp.id,
        dedupe_key: dedupeKey,
        title: alertTitle(followUp, recoveryDirective),
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
