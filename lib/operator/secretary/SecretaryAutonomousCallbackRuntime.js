import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  runSecretaryCallerTurnWithBusinessHours,
  runSecretaryMessageReceptionWithBusinessHours,
} from "./SecretaryAfterHoursConversationRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function one(result) {
  if (result.error) throw result.error;
  return result.data || null;
}

async function many(result) {
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data : [];
}

async function promoteFollowUp(row) {
  if (!row?.id || row.status !== "PENDING" || text(row.action_type, 40).toUpperCase() !== "CALL") return row;
  const metadata = object(row.metadata);
  if (
    text(metadata.execution_owner, 40).toUpperCase() === "SECRETARY" &&
    metadata.execution_ready === true &&
    text(metadata.execution_instruction, 4000)
  ) {
    return row;
  }
  const instruction = text(metadata.execution_instruction || row.reason, 4000);
  if (!instruction) return row;
  const updated = await one(
    supabaseAdmin
      .from("secretary_follow_ups")
      .update({
        metadata: {
          ...metadata,
          execution_owner: "SECRETARY",
          execution_ready: true,
          execution_instruction: instruction,
          secretary_owned: true,
          callback_autonomy_promoted: true,
          callback_autonomy_promoted_at: new Date().toISOString(),
          external_authority_used: false,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", row.organization_id)
      .eq("id", row.id)
      .eq("status", "PENDING")
      .select("*")
      .maybeSingle(),
  );
  return updated || row;
}

async function promoteMessageCallback(request) {
  const requestId = text(request?.id, 120);
  const organizationId = text(request?.organization_id, 120);
  if (!requestId || !organizationId) return null;

  let row = await one(
    supabaseAdmin
      .from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "PENDING")
      .eq("action_type", "CALL")
      .contains("metadata", { secretary_reception_request_id: requestId })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (!row) {
    row = await one(
      supabaseAdmin
        .from("secretary_follow_ups")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("status", "PENDING")
        .eq("action_type", "CALL")
        .contains("metadata", { after_hours_source_reference: requestId })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
  }
  return promoteFollowUp(row);
}

function isCallerRequestedCallback(row, callId) {
  const metadata = object(row?.metadata);
  return (
    metadata.caller_requested === true ||
    metadata.callback_autonomy_promoted === true ||
    text(metadata.after_hours_source_reference, 120) === callId
  );
}

async function cancelSupersededCallbacks(rows, canonical) {
  const duplicates = rows.filter((row) => row.id !== canonical?.id);
  if (!duplicates.length) return 0;
  const now = new Date().toISOString();
  for (const row of duplicates) {
    const result = await supabaseAdmin
      .from("secretary_follow_ups")
      .update({
        status: "CANCELLED",
        result: `Superseded by newer callback request ${canonical.id}`,
        completed_at: now,
        metadata: {
          ...object(row.metadata),
          callback_superseded: true,
          callback_superseded_by: canonical.id,
          callback_superseded_at: now,
        },
        updated_at: now,
      })
      .eq("organization_id", row.organization_id)
      .eq("id", row.id)
      .eq("status", "PENDING");
    if (result.error) throw result.error;
  }
  return duplicates.length;
}

async function promoteCallCallback(callId) {
  const id = text(callId, 120);
  if (!id) return null;
  const call = await one(
    supabaseAdmin.from("secretary_calls").select("id,organization_id").eq("id", id).maybeSingle(),
  );
  if (!call) return null;

  const candidates = await many(
    supabaseAdmin
      .from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", call.organization_id)
      .eq("call_id", call.id)
      .eq("status", "PENDING")
      .eq("action_type", "CALL")
      .order("created_at", { ascending: false })
      .limit(20),
  );
  const callbacks = candidates.filter((row) => isCallerRequestedCallback(row, id));
  const canonical = callbacks[0] || null;
  if (!canonical) return null;
  await cancelSupersededCallbacks(callbacks, canonical);
  return promoteFollowUp(canonical);
}

export async function runSecretaryMessageReceptionAutonomous(request) {
  const result = await runSecretaryMessageReceptionWithBusinessHours(request);
  let promoted = null;
  if (text(result?.action, 80).toUpperCase() === "REQUEST_CALLBACK") {
    promoted = await promoteMessageCallback(request);
  }
  return {
    ...result,
    callback_autonomy_promoted: Boolean(promoted?.id),
    callback_follow_up_id: promoted?.id || result?.action_result?.callback_request?.id || null,
  };
}

export async function runSecretaryCallerTurnAutonomous({ callId, message, language = null } = {}) {
  const result = await runSecretaryCallerTurnWithBusinessHours({ callId, message, language });
  let promoted = null;
  if (text(result?.action, 80).toUpperCase() === "REQUEST_CALLBACK") {
    promoted = await promoteCallCallback(callId);
  }
  return {
    ...result,
    callback_autonomy_promoted: Boolean(promoted?.id),
    callback_follow_up_id: promoted?.id || result?.action_result?.callback_request?.id || null,
  };
}

export default {
  runSecretaryMessageReceptionAutonomous,
  runSecretaryCallerTurnAutonomous,
};
