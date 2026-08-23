import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  normalizeOperatorBusinessThesis,
} from "@/lib/operator/contracts/OperatorBusinessThesis";

const CONTRACT = "AVANTIQO_ORGANIZATION_INTELLIGENCE_STATE_V1";
const MEMORY_TABLE = "intelligence_memories";
const MEMORY_SCOPE = "organization";
const MEMORY_KEY = "organization_intelligence_state:v1";
const MEMORY_TYPE = "fact";
const MEMORY_SOURCE = "synthetic_intelligence_state";
const MAX_RETRIES = 4;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function timestamp(value) {
  const clean = text(value, 80);
  if (!clean) return null;
  const parsed = Date.parse(clean);
  return Number.isFinite(parsed) ? clean : null;
}

function revision(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : 0;
}

function boundedStrings(value, limit = 8, itemLimit = 500) {
  return list(value)
    .map((item) => text(item, itemLimit))
    .filter(Boolean)
    .slice(0, limit);
}

function thesisSummary(thesis) {
  const normalized = normalizeOperatorBusinessThesis(thesis);
  if (!normalized) return null;
  return {
    attention_level: text(normalized.attention_level, 40) || null,
    summary: text(normalized.summary, 1000) || null,
    recommended_next_move:
      text(normalized.recommended_next_move, 900) || null,
    generated_at: timestamp(normalized.generated_at),
    evidence_fingerprint:
      text(normalized.evidence_fingerprint, 240) || null,
    prediction_accountability:
      object(normalized.prediction_accountability),
  };
}

export function normalizeOrganizationIntelligenceState(
  value,
  { organizationId = null, updatedAt = null } = {},
) {
  const source = object(value);
  const resolvedOrganizationId =
    text(organizationId, 120) || text(source.organization_id, 120);
  if (!resolvedOrganizationId) return null;

  const businessThesis = normalizeOperatorBusinessThesis(
    source.business_thesis,
  );

  return {
    contract: CONTRACT,
    version: 1,
    organization_id: resolvedOrganizationId,
    business_thesis: businessThesis,
    strategic_priorities: boundedStrings(source.strategic_priorities),
    unresolved_risks: boundedStrings(source.unresolved_risks),
    opportunities: boundedStrings(source.opportunities),
    last_attention_scan_at: timestamp(source.last_attention_scan_at),
    last_thesis_generated_at:
      timestamp(source.last_thesis_generated_at) ||
      timestamp(businessThesis?.generated_at),
    source_party_id: text(source.source_party_id, 120) || null,
    source_conversation_id:
      text(source.source_conversation_id, 120) || null,
    revision: revision(source.revision),
    updated_at: timestamp(updatedAt) || timestamp(source.updated_at),
  };
}

function stateFromRow(row, organizationId) {
  const metadata = object(row?.metadata);
  return normalizeOrganizationIntelligenceState(
    metadata.organization_intelligence_state,
    {
      organizationId,
      updatedAt: row?.updated_at,
    },
  );
}

function stateContent(state) {
  const thesis = thesisSummary(state?.business_thesis);
  if (!thesis) {
    return [
      "Canonical organization intelligence state.",
      "No evidence-backed organization business thesis has been established yet.",
      "Current business claims still require registered live reads.",
    ].join(" ");
  }

  const accountability = object(thesis.prediction_accountability);
  const scored = Number(accountability?.summary?.scored_count || 0);
  const open = Number(accountability?.summary?.open_count || 0);
  return [
    "Canonical organization intelligence state.",
    thesis.attention_level ? `Attention: ${thesis.attention_level}.` : null,
    thesis.summary ? `Thesis: ${thesis.summary}` : null,
    thesis.recommended_next_move
      ? `Recommended next move: ${thesis.recommended_next_move}`
      : null,
    `Forecast accountability: ${open} open, ${scored} scored.`,
    "This is durable organization context, not live proof and never authorization for a write.",
  ].filter(Boolean).join(" ").slice(0, 1600);
}

async function loadRow(organizationId) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select(
      "id,organization_id,memory_scope,memory_key,content,metadata,active,updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("memory_key", MEMORY_KEY)
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data || null;
}

export async function loadOrganizationIntelligenceState({
  organizationId,
} = {}) {
  const organization = text(organizationId, 120);
  if (!organization) {
    throw new Error("ORGANIZATION_INTELLIGENCE_STATE_ORGANIZATION_REQUIRED");
  }

  const row = await loadRow(organization);
  return {
    persisted: Boolean(row?.id),
    state:
      stateFromRow(row, organization) ||
      normalizeOrganizationIntelligenceState(
        {
          organization_id: organization,
          revision: 0,
        },
        { organizationId: organization },
      ),
    row_id: row?.id || null,
    updated_at: row?.updated_at || null,
  };
}

function nextState(currentState, proposedState, organizationId, updatedAt) {
  const current =
    normalizeOrganizationIntelligenceState(currentState, {
      organizationId,
    }) || {};
  const proposed =
    normalizeOrganizationIntelligenceState(proposedState, {
      organizationId,
    }) || {};

  return normalizeOrganizationIntelligenceState(
    {
      ...current,
      ...proposed,
      organization_id: organizationId,
      revision: revision(current.revision) + 1,
      updated_at: updatedAt,
    },
    { organizationId, updatedAt },
  );
}

async function insertState(organizationId, state, updatedAt) {
  return supabaseAdmin
    .from(MEMORY_TABLE)
    .insert({
      organization_id: organizationId,
      party_id: null,
      entity_id: null,
      conversation_id: null,
      source_turn_id: null,
      memory_scope: MEMORY_SCOPE,
      memory_key: MEMORY_KEY,
      memory_type: MEMORY_TYPE,
      subject: "Canonical Organization Intelligence State",
      content: stateContent(state),
      importance: 1,
      confidence: 1,
      source: MEMORY_SOURCE,
      active: true,
      metadata: {
        contract: CONTRACT,
        organization_intelligence_state: state,
        historical_context_only: true,
        not_live_proof: true,
        never_authorization: true,
      },
      updated_at: updatedAt,
    })
    .select("id,updated_at")
    .maybeSingle();
}

async function updateState(row, organizationId, state, updatedAt) {
  let query = supabaseAdmin
    .from(MEMORY_TABLE)
    .update({
      content: stateContent(state),
      importance: 1,
      confidence: 1,
      source: MEMORY_SOURCE,
      active: true,
      metadata: {
        contract: CONTRACT,
        organization_intelligence_state: state,
        historical_context_only: true,
        not_live_proof: true,
        never_authorization: true,
      },
      updated_at: updatedAt,
    })
    .eq("organization_id", organizationId)
    .eq("id", row.id)
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("memory_key", MEMORY_KEY);

  const expectedUpdatedAt = timestamp(row.updated_at);
  query = expectedUpdatedAt
    ? query.eq("updated_at", expectedUpdatedAt)
    : query.is("updated_at", null);

  return query.select("id,updated_at").maybeSingle();
}

export async function mutateOrganizationIntelligenceState({
  organizationId,
  mutate,
  maxRetries = MAX_RETRIES,
} = {}) {
  const organization = text(organizationId, 120);
  if (!organization) {
    throw new Error("ORGANIZATION_INTELLIGENCE_STATE_ORGANIZATION_REQUIRED");
  }
  if (typeof mutate !== "function") {
    throw new Error("ORGANIZATION_INTELLIGENCE_STATE_MUTATOR_REQUIRED");
  }

  const attempts = Math.max(1, Math.min(Number(maxRetries) || MAX_RETRIES, 8));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const row = await loadRow(organization);
    const currentState =
      stateFromRow(row, organization) ||
      normalizeOrganizationIntelligenceState(
        { organization_id: organization, revision: 0 },
        { organizationId: organization },
      );
    const mutation = await mutate({
      state: currentState,
      persisted: Boolean(row?.id),
      updatedAt: row?.updated_at || null,
      attempt,
    });
    const mutationObject = object(mutation);
    const outcome = Object.prototype.hasOwnProperty.call(
      mutationObject,
      "outcome",
    )
      ? mutationObject.outcome
      : null;

    if (mutationObject.skip === true) {
      return {
        success: true,
        updated: false,
        attempt,
        state: currentState,
        outcome,
      };
    }

    const proposed = Object.prototype.hasOwnProperty.call(
      mutationObject,
      "state",
    )
      ? mutationObject.state
      : mutation;
    const now = new Date().toISOString();
    const state = nextState(currentState, proposed, organization, now);
    const persisted = row?.id
      ? await updateState(row, organization, state, now)
      : await insertState(organization, state, now);

    if (persisted.error) {
      if (!row?.id && text(persisted.error.code, 40) === "23505") {
        continue;
      }
      throw persisted.error;
    }
    if (!persisted.data?.id) continue;

    return {
      success: true,
      updated: true,
      attempt,
      state,
      outcome,
      row_id: persisted.data.id,
      updated_at: persisted.data.updated_at || now,
    };
  }

  const error = new Error(
    "ORGANIZATION_INTELLIGENCE_STATE_CONCURRENT_UPDATE_RETRY_EXHAUSTED",
  );
  error.status = 409;
  throw error;
}

function newerThan(left, right) {
  const leftMs = Date.parse(text(left, 80));
  const rightMs = Date.parse(text(right, 80));
  if (!Number.isFinite(leftMs) || !Number.isFinite(rightMs)) return false;
  return leftMs > rightMs;
}

export async function persistOrganizationBusinessThesis({
  organizationId,
  businessThesis,
  sourcePartyId = null,
  sourceConversationId = null,
  lastAttentionScanAt = null,
} = {}) {
  const incoming = normalizeOperatorBusinessThesis(businessThesis);
  if (!incoming) {
    throw new Error("ORGANIZATION_INTELLIGENCE_STATE_THESIS_REQUIRED");
  }

  return mutateOrganizationIntelligenceState({
    organizationId,
    mutate: ({ state }) => {
      const current = normalizeOperatorBusinessThesis(state.business_thesis);
      if (
        current?.generated_at &&
        incoming?.generated_at &&
        newerThan(current.generated_at, incoming.generated_at)
      ) {
        return {
          skip: true,
          outcome: {
            stale_thesis_ignored: true,
            current_generated_at: current.generated_at,
            incoming_generated_at: incoming.generated_at,
          },
        };
      }

      const sameThesis = Boolean(
        current &&
          text(current.generated_at, 80) === text(incoming.generated_at, 80) &&
          text(current.evidence_fingerprint, 240) ===
            text(incoming.evidence_fingerprint, 240),
      );
      const nextScanAt = timestamp(lastAttentionScanAt);
      if (
        sameThesis &&
        (!nextScanAt || nextScanAt === timestamp(state.last_attention_scan_at))
      ) {
        return {
          skip: true,
          outcome: { unchanged: true, stale_thesis_ignored: false },
        };
      }

      return {
        state: {
          ...state,
          business_thesis: incoming,
          last_attention_scan_at:
            nextScanAt || state.last_attention_scan_at || null,
          last_thesis_generated_at:
            timestamp(incoming.generated_at) ||
            state.last_thesis_generated_at ||
            null,
          source_party_id:
            text(sourcePartyId, 120) || state.source_party_id || null,
          source_conversation_id:
            text(sourceConversationId, 120) ||
            state.source_conversation_id ||
            null,
        },
        outcome: {
          unchanged: false,
          stale_thesis_ignored: false,
        },
      };
    },
  });
}

export const OPERATOR_ORGANIZATION_INTELLIGENCE_STATE_CONTRACT = CONTRACT;
export const OPERATOR_ORGANIZATION_INTELLIGENCE_MEMORY_KEY = MEMORY_KEY;
