import checkDatabaseHealth from "@/lib/health/checkDatabaseHealth";
import { getCommunicationDeliveryHealth } from "@/lib/commercial/communications/CommunicationService";
import { CreativeProductionHealthRuntime } from "@/lib/creative/production/runtime/CreativeProductionHealthRuntime";
import { getOperationsReadiness } from "@/lib/operations/readiness/OperationsReadinessService";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function fulfilled(result, fallbackStatus = "unavailable") {
  if (result?.status === "fulfilled") return result.value;
  return {
    status: fallbackStatus,
    probe_error: true,
  };
}

function countBy(values, key) {
  return values.reduce((totals, value) => {
    const name = text(value?.[key]) || "unknown";
    totals[name] = (totals[name] || 0) + 1;
    return totals;
  }, {});
}

function diagnosis({ code, severity, summary, owner, evidence, nextAction }) {
  return {
    code,
    severity,
    summary,
    owner,
    evidence,
    recommended_next_action: nextAction,
    automatic_repair_authorized: false,
  };
}

export function buildOrganizationSystemHealthSnapshot({
  organizationId,
  phase = "inspection",
  database = {},
  operations = {},
  communications = {},
  creative = {},
  capabilities = [],
} = {}) {
  const diagnoses = [];

  if (database.status !== "healthy") {
    diagnoses.push(
      diagnosis({
        code: "DATABASE_UNAVAILABLE",
        severity: "critical",
        summary: "The primary database health probe did not succeed.",
        owner: "platform",
        evidence: { status: database.status || "unavailable" },
        nextAction:
          "Escalate to platform administration and avoid state-changing actions until database health is restored.",
      }),
    );
  }

  if (!capabilities.length) {
    diagnoses.push(
      diagnosis({
        code: "EXECUTION_CATALOG_UNAVAILABLE",
        severity: "critical",
        summary: "No Operator execution capabilities could be loaded.",
        owner: "ubte",
        evidence: { capability_count: 0 },
        nextAction:
          "Run the Operator exposure and domain-action release audits before attempting repairs.",
      }),
    );
  }

  if (operations.status === "unavailable" || operations.ok === false) {
    diagnoses.push(
      diagnosis({
        code: "OPERATIONS_READINESS_BLOCKED",
        severity: "high",
        summary: "One or more required Operations contracts are unavailable.",
        owner: "operations",
        evidence: {
          blocking_checks: list(operations.blocking_failures).map(
            (item) => item.key,
          ),
        },
        nextAction:
          "Review the named Operations readiness checks and create an incident if no registered repair capability matches the evidence.",
      }),
    );
  } else if (operations.status === "degraded") {
    diagnoses.push(
      diagnosis({
        code: "OPERATIONS_READINESS_WARNING",
        severity: "medium",
        summary: "Operations is available with advisory readiness warnings.",
        owner: "operations",
        evidence: {
          warning_checks: list(operations.warnings).map((item) => item.key),
        },
        nextAction: "Review the advisory checks before running control actions.",
      }),
    );
  }

  if (communications.status === "unavailable") {
    diagnoses.push(
      diagnosis({
        code: "COMMUNICATION_HEALTH_UNAVAILABLE",
        severity: "high",
        summary: "Communication delivery health could not be inspected.",
        owner: "commercial",
        evidence: { probe_error: true },
        nextAction:
          "Inspect the Communications data contract before attempting delivery actions.",
      }),
    );
  } else if (communications.status === "degraded") {
    diagnoses.push(
      diagnosis({
        code: "COMMUNICATION_DELIVERY_DEGRADED",
        severity: "medium",
        summary: "Recent outbound messages include failed or stuck deliveries.",
        owner: "commercial",
        evidence: {
          failed_count: Number(communications.failed_count || 0),
          stuck_count: Number(communications.stuck_count || 0),
          exception_ids: list(communications.exceptions).map(
            (item) => item.message_id,
          ),
        },
        nextAction:
          "Review each exact delivery result. Do not retry automatically because a provider may have accepted a message before reporting an error.",
      }),
    );
  }

  if (creative.status === "unavailable") {
    diagnoses.push(
      diagnosis({
        code: "CREATIVE_HEALTH_UNAVAILABLE",
        severity: "high",
        summary: "Creative production health could not be inspected.",
        owner: "creative",
        evidence: { probe_error: true },
        nextAction:
          "Inspect the Creative production contract before running production or release actions.",
      }),
    );
  } else if (creative.status === "degraded") {
    diagnoses.push(
      diagnosis({
        code: "CREATIVE_PRODUCTION_DEGRADED",
        severity: "medium",
        summary: "Recent Creative production includes failed or stuck tasks.",
        owner: "creative",
        evidence: {
          failed_count: Number(creative.failed_count || 0),
          stuck_count: Number(creative.stuck_count || 0),
          task_ids: list(creative.exceptions).map((item) => item.task_id),
        },
        nextAction:
          "Open the exact project and task evidence, then use only a matching governed Creative repair workflow.",
      }),
    );
  }

  const blocking = diagnoses.filter((item) =>
    ["critical", "high"].includes(item.severity),
  );
  const overallStatus = blocking.length
    ? "unavailable"
    : diagnoses.length
      ? "degraded"
      : "healthy";

  return {
    snapshot_id: crypto.randomUUID(),
    phase: text(phase) === "verification" ? "verification" : "inspection",
    organization_id: organizationId,
    status: overallStatus,
    checked_at: new Date().toISOString(),
    safe_to_execute_reads: database.status === "healthy",
    safe_to_execute_writes: overallStatus !== "unavailable",
    probes: {
      database: {
        status: database.status || "unavailable",
        latency_ms: Number(database.latency_ms || 0),
      },
      execution_catalog: {
        status: capabilities.length ? "healthy" : "unavailable",
        capability_count: capabilities.length,
        by_domain: countBy(capabilities, "domain"),
        by_mode: countBy(capabilities, "mode"),
      },
      operations: {
        status: operations.status || "unavailable",
        capability_count: Number(operations.capability_count || 0),
        blocking_failure_count: list(operations.blocking_failures).length,
        warning_count: list(operations.warnings).length,
      },
      communications,
      creative_production: creative,
    },
    diagnoses,
    recommended_incident_capability:
      diagnoses.length > 0 ? "operations.incidents.create" : null,
    repair_execution_authorized: false,
    verification_required_after_repair: diagnoses.length > 0,
  };
}

export const OrganizationSystemHealthRuntime = {
  async inspect({
    organizationId,
    actorId = null,
    permissions = [],
    entityId = null,
    periodId = null,
    phase = "inspection",
  } = {}) {
    if (!organizationId) throw new Error("SYSTEM_HEALTH_ORGANIZATION_REQUIRED");

    const capabilityPromise = import(
      "@/lib/operator/runtime/OperatorCapabilityCatalog"
    ).then((module) => module.listOperatorCapabilities());
    const results = await Promise.allSettled([
      checkDatabaseHealth({ organizationId }),
      getOperationsReadiness({
        context: {
          organization_id: organizationId,
          entity_id: entityId,
          period_id: periodId,
          actor_id: actorId,
          permissions,
        },
      }),
      getCommunicationDeliveryHealth({ organizationId }),
      CreativeProductionHealthRuntime.inspect({
        organization_id: organizationId,
      }),
      capabilityPromise,
    ]);

    return buildOrganizationSystemHealthSnapshot({
      organizationId,
      phase,
      database: fulfilled(results[0]),
      operations: fulfilled(results[1]),
      communications: fulfilled(results[2]),
      creative: fulfilled(results[3]),
      capabilities:
        results[4]?.status === "fulfilled" && Array.isArray(results[4].value)
          ? results[4].value
          : [],
    });
  },
};

export default OrganizationSystemHealthRuntime;
