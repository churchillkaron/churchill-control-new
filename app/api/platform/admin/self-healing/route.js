import { requirePlatformAdminAccess } from "@/lib/platform/security/requirePlatformAdminAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  preparePlatformSelfHealingCodeMission,
  PLATFORM_SELF_HEALING_CODE_RESEARCH_CONTRACT,
} from "@/lib/platform/self-healing/PlatformSelfHealingCodeResearchRuntime";

export const runtime = "nodejs";
export const maxDuration = 300;

const SYSTEM_EVENT_BACKLOG_KEY = "system-event-backlog";

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

async function resolveAuthoritativeCandidate(signalKey) {
  if (signalKey === SYSTEM_EVENT_BACKLOG_KEY) return loadSystemEventBacklog();
  if (signalKey.startsWith("usage:")) return loadUsageFailure(signalKey);
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
