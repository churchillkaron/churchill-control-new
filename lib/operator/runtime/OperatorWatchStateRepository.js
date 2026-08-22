import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MAX_RETRIES = 4;

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function scopedConversationQuery({ organizationId, partyId, conversationId }) {
  return supabaseAdmin
    .from("intelligence_conversations")
    .select("id, project_state, updated_at, last_message_at")
    .eq("organization_id", organizationId)
    .eq("party_id", partyId)
    .eq("id", conversationId)
    .eq("conversation_key", "primary");
}

async function loadCurrent(scope) {
  const result = await scopedConversationQuery(scope).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data?.id) {
    throw new Error("OPERATOR_AUTONOMOUS_WATCH_CONVERSATION_NOT_FOUND");
  }
  return result.data;
}

function conditionalUpdate(scope, current, projectState, updatedAt) {
  let query = supabaseAdmin
    .from("intelligence_conversations")
    .update({
      project_state: object(projectState),
      updated_at: updatedAt,
    })
    .eq("organization_id", scope.organizationId)
    .eq("party_id", scope.partyId)
    .eq("id", scope.conversationId)
    .eq("conversation_key", "primary");

  const expectedUpdatedAt = text(current?.updated_at, 80);
  query = expectedUpdatedAt
    ? query.eq("updated_at", expectedUpdatedAt)
    : query.is("updated_at", null);

  return query.select("id, updated_at").maybeSingle();
}

export async function mutateOperatorWatchProjectState({
  organizationId,
  partyId,
  conversationId,
  mutate,
  maxRetries = MAX_RETRIES,
} = {}) {
  const scope = {
    organizationId: text(organizationId, 120),
    partyId: text(partyId, 120),
    conversationId: text(conversationId, 120),
  };
  if (!scope.organizationId || !scope.partyId || !scope.conversationId) {
    throw new Error("OPERATOR_AUTONOMOUS_WATCH_SCOPE_REQUIRED");
  }
  if (typeof mutate !== "function") {
    throw new Error("OPERATOR_AUTONOMOUS_WATCH_MUTATOR_REQUIRED");
  }

  const attempts = Math.max(1, Math.min(Number(maxRetries) || MAX_RETRIES, 8));

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const current = await loadCurrent(scope);
    const mutation = await mutate({
      projectState: object(current.project_state),
      updatedAt: text(current.updated_at, 80) || null,
      lastMessageAt: text(current.last_message_at, 80) || null,
      attempt,
    });
    const mutationObject = object(mutation);
    const nextProjectState = object(
      Object.prototype.hasOwnProperty.call(mutationObject, "projectState")
        ? mutationObject.projectState
        : mutation,
    );
    const outcome = Object.prototype.hasOwnProperty.call(mutationObject, "outcome")
      ? mutationObject.outcome
      : null;

    if (mutationObject.skip === true) {
      return {
        success: true,
        updated: false,
        attempt,
        projectState: object(current.project_state),
        outcome,
      };
    }

    const updatedAt = new Date().toISOString();
    const updated = await conditionalUpdate(
      scope,
      current,
      nextProjectState,
      updatedAt,
    );
    if (updated.error) throw updated.error;

    if (updated.data?.id) {
      return {
        success: true,
        updated: true,
        attempt,
        projectState: nextProjectState,
        updatedAt: text(updated.data.updated_at, 80) || updatedAt,
        outcome,
      };
    }
  }

  const error = new Error("OPERATOR_AUTONOMOUS_WATCH_CONCURRENT_UPDATE_RETRY_EXHAUSTED");
  error.status = 409;
  throw error;
}

export default mutateOperatorWatchProjectState;
