import { requirePlatformAdminAccess } from "@/lib/platform/security/requirePlatformAdminAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  getWorkspaceItemByRoute,
  getWorkspaceItemByWorkspace,
  normalizeRegistryItemId,
} from "@/lib/platform/registry/erpRegistry";
import {
  PLATFORM_USER_FAILURE_EVENT_TYPE,
} from "@/lib/platform/self-healing/PlatformUserFailureCaptureRuntime";
import {
  preparePlatformSelfHealingCodeMission,
  PLATFORM_SELF_HEALING_CODE_RESEARCH_CONTRACT,
} from "@/lib/platform/self-healing/PlatformSelfHealingCodeResearchRuntime";

export const runtime = "nodejs";
export const maxDuration = 300;

const SYSTEM_EVENT_BACKLOG_KEY = "system-event-backlog";
const USER_FAILURE_PREFIX = "user-failure:";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUTHORITATIVE_INCOMPLETE_STATUSES = new Set([
  "planned",
  "incomplete",
  "unfinished",
  "unimplemented",
]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeError(error) {
  return text(error?.message || error || "PLATFORM_SELF_HEALING_FAILED", 800);
}

function providerConfigurationFailure(summary = {}) {
  const source = `${text(summary.error_code, 400)} ${text(summary.error_message, 1600)}`.toLowerCase();
  return /accessnotconfigured|service[_ ]?disabled|api.*(?:has )?not been used|api.*disabled|api.*not enabled|enable.*api|credential|oauth|access token|quota|billing account|missing secret/.test(source);
}

function classifyCapturedFailure(payload = {}) {
  const category = text(payload.category, 80).toLowerCase();
  if (providerConfigurationFailure({ error_message: payload.error_message })) {
    return "NON_CODE_CONFIGURATION";
  }
  if (category === "capability_unimplemented" || category === "workspace_unfinished") {
    return "AUTO_COMPLETE";
  }
  if (
    category === "organization_context_missing" ||
    category === "runtime_exception" ||
    category === "request_failure"
  ) {
    return "AUTO_REPAIR";
  }
  return "PRODUCT_DECISION_REQUIRED";
}

function normalizedRegistryValue(value) {
  return normalizeRegistryItemId(text(value, 300));
}

function canonicalCapabilityIds(item = {}) {
  return new Set([
    item.id,
    item.data?.capability,
    item.create?.capability,
  ].map(normalizedRegistryValue).filter(Boolean));
}

function authoritativeIncompleteRegistryTarget({ route, workspace, capability }) {
  const routeHint = text(route, 600) || null;
  const workspaceHint = normalizedRegistryValue(workspace);
  const capabilityHint = normalizedRegistryValue(capability);
  let item = routeHint ? getWorkspaceItemByRoute(routeHint) : null;
  let matchSource = item ? "route" : null;

  if (routeHint && !item) {
    return {
      proven: false,
      reason: "The browser-reported route does not resolve to a canonical ERP_REGISTRY workspace item.",
    };
  }

  if (!item && workspaceHint && capabilityHint) {
    item = getWorkspaceItemByWorkspace(workspaceHint, capabilityHint);
    matchSource = item ? "workspace_capability" : null;
  }

  if (!item) {
    return {
      proven: false,
      reason: "AUTO_COMPLETE requires an exact canonical ERP_REGISTRY route or workspace+capability match.",
    };
  }

  const canonicalWorkspace = normalizedRegistryValue(item.workspaceId);
  if (workspaceHint && canonicalWorkspace !== workspaceHint) {
    return {
      proven: false,
      reason: "The browser-reported workspace does not match the canonical ERP_REGISTRY workspace for this route.",
    };
  }

  const canonicalCapabilities = canonicalCapabilityIds(item);
  if (capabilityHint && !canonicalCapabilities.has(capabilityHint)) {
    return {
      proven: false,
      reason: "The browser-reported capability does not match the canonical ERP_REGISTRY capability for this workspace item.",
    };
  }

  const status = text(item.status, 80).toLowerCase();
  if (!AUTHORITATIVE_INCOMPLETE_STATUSES.has(status)) {
    return {
      proven: false,
      reason: "The canonical ERP_REGISTRY item is not explicitly marked incomplete or unimplemented.",
    };
  }

  return {
    proven: true,
    item,
    evidence: {
      match_source: matchSource,
      workspace_id: item.workspaceId || null,
      item_id: item.id || null,
      capability: item.data?.capability || item.create?.capability || item.id || null,
      route: item.route || null,
      status,
      explicit_incomplete_status: true,
    },
  };
}

function capturedFailureExpectedOutcome(category) {
  if (category === "organization_context_missing") {
    return "The original user action resolves authoritative organization context and completes without a missing-organization failure.";
  }
  if (category === "workspace_unfinished" || category === "capability_unimplemented") {
    return "The registered Avantiqo workspace or capability completes the intended business action through its governed production path.";
  }
  return "The original Avantiqo user action completes through its intended governed capability without reproducing the captured failure.";
}

async function loadUsageFailure(signalKey) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin.rpc("platform_operator_usage_failure_detail", {
    p_signal_key: signalKey,
    p_since: since,
  });
  if (error) throw error;
  const detail = data || {};
  const summary = detail?.summary || {};
  if (number(summary.occurrence_count) <= 0) return null;
  const configurationFailure = providerConfigurationFailure(summary);

  return {
    signalKey,
    organizationId: text(summary.organization_id, 200) || null,
    payload: {
      failure_id: signalKey,
      signal_key: signalKey,
      problem_type: "service_execution_failure",
      category: "service_execution",
      source: "platform_service_usage",
      title: `${text(summary.provider, 120) || "provider"} · ${text(summary.capability, 240) || "service execution"} is failing`,
      error_class: configurationFailure ? "PROVIDER_CONFIGURATION_FAILURE" : "SERVICE_EXECUTION_FAILURE",
      error_code: text(summary.error_code, 300) || null,
      error_message: text(summary.error_message, 1200) || null,
      capability: text(summary.capability, 300) || null,
      action: "execute service capability",
      evidence: {
        occurrence_count: number(summary.occurrence_count),
        provider: text(summary.provider, 120) || null,
        capability: text(summary.capability, 300) || null,
        error_class: configurationFailure ? "PROVIDER_CONFIGURATION_FAILURE" : "SERVICE_EXECUTION_FAILURE",
        error_code: text(summary.error_code, 300) || null,
        error_message: text(summary.error_message, 1200) || null,
        first_seen_at: summary.first_seen_at || null,
        last_seen_at: summary.last_seen_at || null,
      },
      expected_contract: {
        capability: text(summary.capability, 300) || null,
        action: "execute service capability",
        expected_outcome: "The configured service capability completes successfully without a repeating provider/runtime failure.",
      },
    },
  };
}

async function loadSystemEventBacklog() {
  const { data, error } = await supabaseAdmin
    .from("system_events")
    .select("id,organization_id,type,created_at,processed,processing,attempt_count,last_error,last_failed_at")
    .eq("processed", false)
    .order("created_at", { ascending: true })
    .limit(250);
  if (error) throw error;
  const rows = data || [];
  if (!rows.length) return null;

  const organizationIds = [...new Set(rows.map((row) => text(row.organization_id, 200)).filter(Boolean))];
  const organizationId = organizationIds.length === 1 ? organizationIds[0] : null;
  if (!organizationId) {
    throw new Error("PLATFORM_SELF_HEALING_BACKLOG_ORGANIZATION_AMBIGUOUS");
  }

  const attempted = rows.filter((row) =>
    number(row.attempt_count) > 0 || row.processing === true || row.last_failed_at || text(row.last_error),
  );
  const neverAttempted = rows.length - attempted.length;
  const diagnosis = neverAttempted === rows.length
    ? "consumer_not_claiming"
    : attempted.length === rows.length
      ? "processing_or_retry_failure"
      : "mixed_backlog";

  return {
    signalKey: SYSTEM_EVENT_BACKLOG_KEY,
    organizationId,
    payload: {
      failure_id: SYSTEM_EVENT_BACKLOG_KEY,
      signal_key: SYSTEM_EVENT_BACKLOG_KEY,
      problem_type: "event_processing_backlog",
      category: "event_processing",
      source: "system_events",
      title: diagnosis === "consumer_not_claiming"
        ? "System event consumer is not claiming queued events"
        : "System event backlog is not draining",
      error_class: diagnosis === "consumer_not_claiming"
        ? "EVENT_CONSUMER_NOT_CLAIMING"
        : "EVENT_PROCESSING_BACKLOG",
      error_message: attempted.find((row) => text(row.last_error))?.last_error || null,
      capability: "system.event.consume",
      action: "claim and process queued business event",
      evidence: {
        diagnosis,
        occurrence_count: rows.length,
        never_attempted_count: neverAttempted,
        attempted_count: attempted.length,
        first_seen_at: rows[0]?.created_at || null,
        last_seen_at: rows[rows.length - 1]?.created_at || null,
        event_types: [...new Set(rows.map((row) => text(row.type, 240)).filter(Boolean))].slice(0, 20),
      },
      expected_contract: {
        capability: "system.event.consume",
        action: "claim and process queued business event",
        expected_outcome: "A registered consumer claims each eligible queued event, processes it idempotently, records success or governed retry evidence, and drains the backlog without falsely marking unhandled events processed.",
      },
    },
  };
}

async function loadCapturedUserFailure(signalKey) {
  const eventId = text(signalKey.slice(USER_FAILURE_PREFIX.length), 100);
  if (!UUID_PATTERN.test(eventId)) {
    return {
      blocked: true,
      classification: "NOT_CODE_CANDIDATE",
      reason: "Captured user failure signal is malformed.",
    };
  }

  const { data, error } = await supabaseAdmin
    .from("system_events")
    .select("id,organization_id,type,payload,created_at")
    .eq("id", eventId)
    .eq("type", PLATFORM_USER_FAILURE_EVENT_TYPE)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const stored = data.payload && typeof data.payload === "object" ? data.payload : {};
  const classification = classifyCapturedFailure(stored);
  const category = text(stored.category, 80).toLowerCase() || "runtime_exception";
  const organizationId = text(data.organization_id, 200) || null;

  if (!organizationId) {
    return {
      blocked: true,
      classification: "ORGANIZATION_SCOPE_REQUIRED",
      reason: "Captured failure has no unambiguous authoritative organization scope. Autonomous Code preparation is blocked.",
    };
  }
  if (classification === "NON_CODE_CONFIGURATION") {
    return {
      blocked: true,
      classification,
      reason: "The captured failure indicates provider configuration, credentials, quota, OAuth, billing, or API enablement. Code changes are not the remediation path.",
    };
  }
  if (classification === "PRODUCT_DECISION_REQUIRED") {
    return {
      blocked: true,
      classification,
      reason: "The captured evidence does not establish a registered implementation contract strongly enough for autonomous Code repair. Product intent must be resolved first.",
    };
  }

  const capabilityHint = text(stored.capability, 300) || null;
  const workspaceHint = text(stored.workspace, 300) || null;
  const action = text(stored.action, 300) || "complete original user action";
  const route = text(stored.route, 600) || null;
  const errorMessage = text(stored.error_message, 1200) || null;
  let registryProof = null;
  let capability = capabilityHint;
  let workspace = workspaceHint;

  if (classification === "AUTO_COMPLETE") {
    registryProof = authoritativeIncompleteRegistryTarget({
      route,
      workspace: workspaceHint,
      capability: capabilityHint,
    });
    if (!registryProof.proven) {
      return {
        blocked: true,
        classification: "REGISTRY_PROOF_REQUIRED",
        reason: registryProof.reason,
      };
    }
    capability = registryProof.evidence.capability;
    workspace = registryProof.evidence.workspace_id;
  }

  return {
    signalKey,
    organizationId,
    payload: {
      failure_id: eventId,
      signal_key: signalKey,
      problem_type: classification === "AUTO_COMPLETE" ? "registered_capability_incomplete" : "user_action_failure",
      category,
      source: "system_events.platform_user_failure_capture",
      title: classification === "AUTO_COMPLETE"
        ? `${registryProof?.item?.name || capability || workspace || "Registered Avantiqo capability"} is incomplete`
        : `${capability || workspace || route || "Avantiqo user action"} failed`,
      error_class: category.toUpperCase(),
      error_message: errorMessage,
      capability,
      workspace,
      route,
      action,
      classification,
      evidence: {
        event_id: eventId,
        captured_at: data.created_at || stored.occurred_at || null,
        route,
        status_code: stored.status_code ?? null,
        error_digest: text(stored.error_digest, 200) || null,
        organization_scope: text(stored.organization_scope, 120) || null,
        browser_evidence_authoritative: false,
        classification_candidate_ignored: text(stored.classification_candidate, 120) || null,
        authoritative_registry_proof: registryProof?.evidence || null,
        raw_stack_stored: false,
        raw_request_body_stored: false,
      },
      replay: {
        route,
        action,
        capability,
        workspace,
        reconstruct_from_authoritative_state: true,
        original_browser_payload_authoritative: false,
      },
      expected_contract: {
        capability,
        workspace,
        action,
        expected_outcome: capturedFailureExpectedOutcome(category),
        verification_requires_original_action_replay: true,
      },
    },
  };
}

async function resolveAuthoritativeCandidate(signalKey) {
  if (signalKey === SYSTEM_EVENT_BACKLOG_KEY) return loadSystemEventBacklog();
  if (signalKey.startsWith("usage:")) return loadUsageFailure(signalKey);
  if (signalKey.startsWith(USER_FAILURE_PREFIX)) return loadCapturedUserFailure(signalKey);
  return {
    blocked: true,
    classification: "NOT_CODE_CANDIDATE",
    reason: "This operator signal already has a source-specific remediation workflow. Code repair is intentionally not started from this signal.",
  };
}

export async function POST(request) {
  const access = await requirePlatformAdminAccess();
  if (!access.success) {
    return Response.json({ success: false, error: access.error }, { status: access.status });
  }

  const body = await request.json().catch(() => ({}));
  const signalKey = text(body.signalKey || body.signal_key, 240);
  if (!signalKey) {
    return Response.json({ success: false, error: "signalKey required" }, { status: 400 });
  }

  try {
    const candidate = await resolveAuthoritativeCandidate(signalKey);
    if (!candidate) {
      return Response.json({
        success: false,
        error: "Signal is no longer present in authoritative evidence",
      }, { status: 409 });
    }
    if (candidate.blocked) {
      return Response.json({
        success: true,
        contract: PLATFORM_SELF_HEALING_CODE_RESEARCH_CONTRACT,
        status: "CODE_REPAIR_NOT_APPLICABLE",
        classification: candidate.classification,
        reason: candidate.reason,
        code_execution_allowed: false,
      });
    }
    if (!candidate.organizationId) {
      return Response.json({
        success: false,
        error: "Authoritative organization scope is required before a Code mission can be prepared",
      }, { status: 409 });
    }

    const context = {
      organizationId: candidate.organizationId,
      organization_id: candidate.organizationId,
      partyId: access.staff?.party_id || null,
      actor: { id: access.user?.id || null },
      metadata: {
        partyId: access.staff?.party_id || null,
        platform_self_healing: true,
        platform_operator_signal_key: signalKey,
      },
    };

    const prepared = await preparePlatformSelfHealingCodeMission({
      context,
      payload: candidate.payload,
    });

    return Response.json({
      success: true,
      ...prepared,
      organizationId: candidate.organizationId,
      repository_url: "https://github.com/churchillkaron/churchill-control-new",
      ref: "main",
      signalKey,
      authoritative_source_resolved: true,
      browser_evidence_authoritative: false,
      code_execution_started: false,
      commit_performed: false,
      production_deploy_performed: false,
    });
  } catch (error) {
    console.error("PLATFORM_SELF_HEALING_PREPARATION_FAILED", {
      signal_key: signalKey,
      error: safeError(error),
      commit_performed: false,
      production_deploy_performed: false,
    });
    return Response.json({
      success: false,
      contract: PLATFORM_SELF_HEALING_CODE_RESEARCH_CONTRACT,
      error: safeError(error),
      code_execution_started: false,
      commit_performed: false,
      production_deploy_performed: false,
    }, { status: 500 });
  }
}
