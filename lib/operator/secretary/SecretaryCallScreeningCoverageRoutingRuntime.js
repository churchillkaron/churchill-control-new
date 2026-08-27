import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { screenSecretaryCall as screenSecretaryCallBase } from "@/lib/operator/secretary/SecretaryCallScreeningRuntime";
import {
  resolveSecretaryAdministrativeCoverage,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_CALL_SCREENING_COVERAGE_ROUTING_V1";
const CALL_METADATA_KEY = "call_screening_v1";
const OWNER_AUTHORITY_ROUTES = new Set(["INTERRUPT_EXECUTIVE", "EXECUTIVE_REVIEW"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function loadCall(organizationId, callId) {
  return one(
    supabaseAdmin.from("secretary_calls")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", callId)
      .maybeSingle(),
  );
}

async function ownerPartyIdForCall(call, fallbackPartyId) {
  if (!call?.phone_line_id) return text(fallbackPartyId, 120) || null;
  const line = await one(
    supabaseAdmin.from("secretary_phone_lines")
      .select("owner_party_id")
      .eq("organization_id", call.organization_id)
      .eq("id", call.phone_line_id)
      .maybeSingle(),
  );
  return text(line?.owner_party_id || fallbackPartyId, 120) || null;
}

async function mutateScreeningCoverage({ organizationId, callId, screeningId, coverageMetadata }) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const call = await loadCall(organizationId, callId);
    if (!call) throw new Error("SECRETARY_CALL_SCREENING_CALL_NOT_FOUND");
    const metadata = object(call.metadata);
    const state = object(metadata[CALL_METADATA_KEY]);
    const screenings = list(state.screenings);
    const target = screenings.find((item) => item.id === screeningId);
    if (!target) throw new Error("SECRETARY_CALL_SCREENING_RECORD_NOT_FOUND");
    if (target.secretary_call_screening_coverage_routed === true) return target;
    const next = {
      ...target,
      secretary_call_screening_coverage_routed: true,
      secretary_coverage_scope: "CALL_SCREENING",
      ...coverageMetadata,
    };
    const update = await supabaseAdmin.from("secretary_calls")
      .update({
        metadata: {
          ...metadata,
          [CALL_METADATA_KEY]: {
            ...state,
            screenings: screenings.map((item) => item.id === screeningId ? next : item),
            external_authority_used: false,
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId)
      .eq("id", callId)
      .eq("updated_at", call.updated_at)
      .select("*")
      .maybeSingle();
    if (update.error) throw update.error;
    if (update.data) return next;
  }
  throw new Error("SECRETARY_CALL_SCREENING_COVERAGE_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

async function updateRoutingTask(task, coverageMetadata, ownerAuthorityRequired) {
  if (!task?.id) return task || null;
  const updated = await one(
    supabaseAdmin.from("secretary_tasks")
      .update({
        metadata: {
          ...object(task.metadata),
          secretary_coverage_scope: "CALL_SCREENING",
          requires_owner_authority: ownerAuthorityRequired,
          ...coverageMetadata,
          platform_permissions_mutated: false,
          binding_authority_delegated: false,
          approval_authority_delegated: false,
          external_authority_used: false,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", task.organization_id)
      .eq("id", task.id)
      .select("*")
      .single(),
  );
  return updated;
}

async function updateCallbackFollowUp({ followUp, routing }) {
  if (!followUp?.id || !routing) return followUp || null;
  const coverageMetadata = secretaryAdministrativeCoverageMetadata(routing);
  return one(
    supabaseAdmin.from("secretary_follow_ups")
      .update({
        metadata: {
          ...object(followUp.metadata),
          secretary_coverage_scope: "FOLLOW_UP_COORDINATION",
          secretary_call_screening_callback_coverage_snapshot: true,
          ...coverageMetadata,
          platform_permissions_mutated: false,
          binding_authority_delegated: false,
          approval_authority_delegated: false,
          external_authority_used: false,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", followUp.organization_id)
      .eq("id", followUp.id)
      .select("*")
      .single(),
  );
}

export async function screenSecretaryCallWithCoverageRouting({ context, payload = {} } = {}) {
  const result = await screenSecretaryCallBase({ context, payload });
  const organizationId = text(context?.organizationId, 120);
  const actorPartyId = text(context?.actor?.partyId || context?.actor?.party_id || context?.metadata?.partyId, 120);
  const callId = text(result.call_id, 120);
  const screening = object(result.screening);
  if (!organizationId || !callId || !text(screening.id, 120)) return result;

  const call = await loadCall(organizationId, callId);
  if (!call) throw new Error("SECRETARY_CALL_SCREENING_CALL_NOT_FOUND");
  const ownerPartyId = await ownerPartyIdForCall(call, actorPartyId);
  if (!ownerPartyId) throw new Error("SECRETARY_COVERAGE_ROUTING_OWNER_PARTY_REQUIRED");

  const ownerAuthorityRequired = OWNER_AUTHORITY_ROUTES.has(text(screening.route, 80).toUpperCase());
  const callRouting = await resolveSecretaryAdministrativeCoverage({
    organizationId,
    ownerPartyId,
    scope: "CALL_SCREENING",
    instruction: screening.caller_request || `Handle screened inbound call route ${screening.route || "UNKNOWN"}`,
    at: screening.screened_at || new Date().toISOString(),
    requiresOwnerAuthority: ownerAuthorityRequired,
  });
  const callCoverageMetadata = secretaryAdministrativeCoverageMetadata(callRouting);
  const routedScreening = await mutateScreeningCoverage({
    organizationId,
    callId,
    screeningId: screening.id,
    coverageMetadata: {
      ...callCoverageMetadata,
      secretary_owner_authority_required: ownerAuthorityRequired,
      executive_interrupt_route_delegated: false,
      executive_review_route_delegated: false,
    },
  });

  const routingTask = await updateRoutingTask(
    result.routing_task,
    {
      ...callCoverageMetadata,
      executive_interrupt_route_delegated: false,
      executive_review_route_delegated: false,
    },
    ownerAuthorityRequired,
  );

  let callbackFollowUp = result.callback_follow_up || null;
  let callbackRouting = null;
  if (callbackFollowUp?.id) {
    callbackRouting = await resolveSecretaryAdministrativeCoverage({
      organizationId,
      ownerPartyId,
      scope: "FOLLOW_UP_COORDINATION",
      instruction: screening.caller_request || "Return screened caller's call.",
      at: screening.screened_at || new Date().toISOString(),
      requiresOwnerAuthority: false,
    });
    callbackFollowUp = await updateCallbackFollowUp({ followUp: callbackFollowUp, routing: callbackRouting });
  }

  return {
    ...result,
    contract: result.contract,
    coverage_contract: CONTRACT,
    screening: routedScreening,
    routing_task: routingTask,
    callback_follow_up: callbackFollowUp,
    canonical_owner_party_id: callRouting.canonical_owner_party_id,
    operational_assignee_party_id: callRouting.operational_assignee_party_id,
    secretary_coverage_applied: callRouting.coverage_applied === true,
    secretary_coverage_scope: "CALL_SCREENING",
    secretary_coverage_routing_review_required: callRouting.coverage_routing_review_required === true,
    executive_interrupt_route_delegated: false,
    executive_review_route_delegated: false,
    callback_follow_up_coverage_scope: callbackRouting ? "FOLLOW_UP_COORDINATION" : null,
    callback_follow_up_operational_assignee_party_id: callbackRouting?.operational_assignee_party_id || null,
    platform_permissions_mutated: false,
    binding_authority_delegated: false,
    approval_authority_delegated: false,
    external_authority_used: false,
  };
}

export default screenSecretaryCallWithCoverageRouting;
