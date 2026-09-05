const FAILURE_STATES = new Set([
  "FAILED",
  "FAILURE",
  "ERROR",
  "BLOCKED",
  "REJECTED",
  "CANCELLED",
  "CANCELED",
]);

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestamp(value) {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function ageHours(value, nowMs) {
  const parsed = timestamp(value);
  return parsed === null ? null : Math.max(0, (nowMs - parsed) / 3_600_000);
}

function isUsageFailure(row) {
  return FAILURE_STATES.has(text(row?.status).toUpperCase()) ||
    FAILURE_STATES.has(text(row?.execution_status).toUpperCase());
}

function organizationMap(organizations) {
  return new Map((organizations || []).map(org => [text(org?.id), text(org?.name || org?.legal_name || org?.display_name || "Organization")]));
}

function groupRows(rows, keyFor) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = keyFor(row);
    const bucket = groups.get(key) || [];
    bucket.push(row);
    groups.set(key, bucket);
  }
  return [...groups.values()];
}

function severityWeight(value) {
  const severity = text(value).toLowerCase();
  if (severity === "critical") return 4;
  if (severity === "high") return 3;
  if (severity === "medium" || severity === "warning") return 2;
  return 1;
}

function stateFromSignals(signals) {
  if (signals.some(signal => signal.severity === "critical")) return "critical";
  if (signals.some(signal => signal.severity === "high")) return "attention";
  if (signals.length) return "review";
  return "clear";
}

function recencySeverity(sourceSeverity, latestAt, nowMs) {
  const hours = ageHours(latestAt, nowMs);
  const sourceWeight = severityWeight(sourceSeverity);

  if (hours !== null && hours <= 24) {
    if (sourceWeight >= 4) return { severity: "critical", score: 92 };
    if (sourceWeight >= 3) return { severity: "high", score: 84 };
    return { severity: "medium", score: 68 };
  }

  if (hours !== null && hours <= 24 * 7) {
    if (sourceWeight >= 4) return { severity: "high", score: 78 };
    return { severity: "medium", score: 64 };
  }

  if (hours !== null && hours <= 24 * 30) {
    return { severity: sourceWeight >= 4 ? "medium" : "low", score: 56 };
  }

  return { severity: "medium", score: 48 };
}

function latestRow(rows, keys = ["created_at"]) {
  return [...(rows || [])].sort((left, right) => {
    const leftAt = keys.map(key => timestamp(left?.[key])).find(Boolean) || 0;
    const rightAt = keys.map(key => timestamp(right?.[key])).find(Boolean) || 0;
    return rightAt - leftAt;
  })[0] || null;
}

export default function buildPlatformOperatorControl({
  now = new Date(),
  organizations = [],
  health = {},
  recentUsage = [],
  usageFailureCount24h = 0,
  systemAlerts = [],
  securityIncidents = [],
  systemEvents = [],
  wallets = [],
  releaseHistory = {},
  coverage = [],
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const orgs = organizationMap(organizations);
  const signals = [];

  const recentFailures = (recentUsage || []).filter(row => {
    if (!isUsageFailure(row)) return false;
    const age = ageHours(row?.created_at, nowMs);
    return age !== null && age <= 24;
  });

  if (number(usageFailureCount24h) > 0) {
    const latest = latestRow(recentFailures) || recentUsage.find(isUsageFailure) || null;
    const provider = text(latest?.provider || "Runtime provider");
    const capability = text(latest?.capability || latest?.operation || "service execution");
    const organizationId = text(latest?.organization_id) || null;
    const count = number(usageFailureCount24h);
    const sampledFailures = recentFailures.length;
    const matchingSample = recentFailures.filter(row =>
      text(row?.provider) === text(latest?.provider) &&
      text(row?.capability) === text(latest?.capability) &&
      text(row?.error_message) === text(latest?.error_message),
    ).length;

    signals.push({
      id: "live-service-failures-24h",
      severity: count >= 25 ? "critical" : "high",
      score: count >= 25 ? 100 : 90,
      state: "live",
      category: "service_execution",
      title: `${provider} · ${capability} is failing now`,
      summary: `${count.toLocaleString("en-US")} failed executions in the last 24 hours${organizationId ? ` · ${orgs.get(organizationId) || organizationId}` : ""}.`,
      organizationId,
      source: "platform_service_usage",
      target: "issues",
      occurredAt: latest?.created_at || null,
      evidence: {
        failureCount24h: count,
        provider: provider || null,
        capability: capability || null,
        latestError: text(latest?.error_message) || null,
        observedFailureRows: sampledFailures,
        matchingLatestFingerprintRows: matchingSample,
      },
    });
  }

  const runtimeState = text(health?.status || "unknown").toLowerCase();
  if (["degraded", "unverified", "partial"].includes(runtimeState)) {
    signals.push({
      id: "runtime-health",
      severity: runtimeState === "degraded" ? "critical" : "high",
      score: runtimeState === "degraded" ? 98 : 86,
      state: "live",
      category: "runtime",
      title: `Platform runtime is ${runtimeState}`,
      summary: "Runtime health is not in a fully verified operational state. Inspect the demand, lease and heartbeat evidence before taking action.",
      organizationId: null,
      source: "checkSystemHealth",
      target: "runtime",
      occurredAt: health?.timestamp || null,
      evidence: {
        runtimeState,
        queueState: health?.services?.queue?.status || null,
        databaseState: health?.services?.database?.status || null,
      },
    });
  }

  const unprocessedEvents = (systemEvents || []).filter(row => row?.processed !== true);
  if (unprocessedEvents.length) {
    const oldest = [...unprocessedEvents].sort((a, b) => (timestamp(a?.created_at) || 0) - (timestamp(b?.created_at) || 0))[0];
    const oldestHours = ageHours(oldest?.created_at, nowMs);
    signals.push({
      id: "system-event-backlog",
      severity: oldestHours !== null && oldestHours > 24 ? "high" : "medium",
      score: oldestHours !== null && oldestHours > 24 ? 88 : 70,
      state: "open",
      category: "event_processing",
      title: "System event backlog is not draining",
      summary: `${unprocessedEvents.length} event${unprocessedEvents.length === 1 ? "" : "s"} remain unprocessed${oldestHours !== null ? `; the oldest is ${Math.floor(oldestHours)} hours old` : ""}.`,
      organizationId: text(oldest?.organization_id) || null,
      source: "system_events",
      target: "runtime",
      occurredAt: oldest?.created_at || null,
      evidence: {
        backlogCount: unprocessedEvents.length,
        oldestEventType: text(oldest?.type) || null,
        oldestCreatedAt: oldest?.created_at || null,
        oldestAttemptCount: number(oldest?.attempt_count),
        oldestError: text(oldest?.last_error) || null,
      },
    });
  }

  const openAlerts = (systemAlerts || []).filter(row => !row?.resolved_at && text(row?.status || "OPEN").toUpperCase() !== "RESOLVED");
  for (const group of groupRows(openAlerts, row => `${text(row?.organization_id)}|${text(row?.title || row?.alert_type)}`)) {
    const latest = latestRow(group);
    const sourceSeverity = group.reduce((best, row) => severityWeight(row?.severity) > severityWeight(best) ? row?.severity : best, "low");
    const ranked = recencySeverity(sourceSeverity, latest?.created_at, nowMs);
    const organizationId = text(latest?.organization_id) || null;
    const age = ageHours(latest?.created_at, nowMs);
    signals.push({
      id: `system-alert:${text(latest?.title || latest?.alert_type)}:${organizationId || "platform"}`,
      severity: ranked.severity,
      score: ranked.score,
      state: age !== null && age > 24 * 30 ? "stale-open" : "open",
      category: "system_alert",
      title: `${group.length} unresolved alert${group.length === 1 ? "" : "s"} · ${text(latest?.title || latest?.alert_type || "System alert")}`,
      summary: `${organizationId ? `${orgs.get(organizationId) || organizationId} · ` : ""}${text(latest?.message) || "Persisted system alert requires review."}${age !== null && age > 24 * 30 ? " This is historical unresolved debt, not a fresh incident." : ""}`,
      organizationId,
      source: "system_alerts",
      target: "issues",
      occurredAt: latest?.created_at || null,
      evidence: {
        openCount: group.length,
        persistedSeverity: sourceSeverity,
        latestAlertAt: latest?.created_at || null,
      },
    });
  }

  const openIncidents = (securityIncidents || []).filter(row => !row?.resolved_at && !["RESOLVED", "CLOSED"].includes(text(row?.incident_status).toUpperCase()));
  for (const group of groupRows(openIncidents, row => `${text(row?.incident_type)}|${text(row?.incident_summary)}`)) {
    const latest = latestRow(group);
    const sourceSeverity = group.reduce((best, row) => severityWeight(row?.severity) > severityWeight(best) ? row?.severity : best, "low");
    const ranked = recencySeverity(sourceSeverity, latest?.created_at, nowMs);
    const age = ageHours(latest?.created_at, nowMs);
    signals.push({
      id: `security-incident:${text(latest?.incident_type)}:${text(latest?.incident_summary)}`,
      severity: ranked.severity,
      score: ranked.score + 1,
      state: age !== null && age > 24 * 30 ? "stale-open" : "open",
      category: "security_incident",
      title: `${group.length} unresolved incident${group.length === 1 ? "" : "s"} · ${text(latest?.incident_type || "Security incident")}`,
      summary: `${text(latest?.incident_summary) || "Persisted security incident requires review."}${age !== null && age > 24 * 30 ? " Historical unresolved debt is retained but ranked below fresh impact." : ""}`,
      organizationId: text(latest?.organization_id) || null,
      source: "enterprise_security_incidents",
      target: "issues",
      occurredAt: latest?.created_at || null,
      evidence: {
        openCount: group.length,
        persistedSeverity: sourceSeverity,
        latestIncidentAt: latest?.created_at || null,
      },
    });
  }

  const walletBlockers = (wallets || []).filter(wallet => {
    const status = text(wallet?.status).toUpperCase();
    const policy = text(wallet?.billing_policy).toUpperCase();
    if (status !== "ACTIVE" || policy !== "PREPAID") return true;
    if (number(wallet?.available_balance) > 0) return false;
    const lastChargeAge = ageHours(wallet?.last_charge_at, nowMs);
    return number(wallet?.lifetime_usage) > 0 || (lastChargeAge !== null && lastChargeAge <= 24 * 30);
  });

  if (walletBlockers.length) {
    const latest = latestRow(walletBlockers, ["last_charge_at", "updated_at"]);
    signals.push({
      id: "active-wallet-blockers",
      severity: "high",
      score: 80,
      state: "open",
      category: "wallet",
      title: `${walletBlockers.length} active wallet blocker${walletBlockers.length === 1 ? "" : "s"}`,
      summary: "Only wallets with real usage/charge history or invalid runtime policy are escalated. Dormant zero-balance wallets are intentionally excluded.",
      organizationId: text(latest?.organization_id) || null,
      source: "organization_wallets",
      target: "wallet",
      occurredAt: latest?.last_charge_at || latest?.updated_at || null,
      evidence: {
        blockerCount: walletBlockers.length,
      },
    });
  }

  if (releaseHistory?.status !== "verified") {
    signals.push({
      id: "release-history-unverified",
      severity: "medium",
      score: 62,
      state: "unverified",
      category: "release_governance",
      title: "Deployment history cannot be verified inside Platform",
      summary: "Build identity remains separate from deployment truth. Platform will not infer releases from Git commits while the authoritative deployment probe is unavailable.",
      organizationId: null,
      source: releaseHistory?.source || "release_history",
      target: "runtime",
      occurredAt: releaseHistory?.checkedAt || null,
      evidence: {
        source: releaseHistory?.source || null,
        error: text(releaseHistory?.error) || null,
      },
    });
  }

  signals.sort((left, right) => right.score - left.score || (timestamp(right.occurredAt) || 0) - (timestamp(left.occurredAt) || 0));

  const counts = signals.reduce((accumulator, signal) => {
    accumulator[signal.severity] = number(accumulator[signal.severity]) + 1;
    return accumulator;
  }, { critical: 0, high: 0, medium: 0, low: 0 });

  const verifiedSources = (coverage || []).filter(source => source?.status === "verified").length;

  return {
    generatedAt: new Date(nowMs).toISOString(),
    status: stateFromSignals(signals),
    counts: {
      ...counts,
      total: signals.length,
    },
    coverage: {
      verified: verifiedSources,
      total: (coverage || []).length,
      sources: coverage || [],
    },
    policy: "LIVE_IMPACT_THEN_RUNTIME_THEN_ACTIVE_BLOCKERS_THEN_FRESH_ALERTS_THEN_STALE_DEBT",
    signals,
  };
}
