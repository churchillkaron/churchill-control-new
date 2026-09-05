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
  if (hours !== null && hours <= 24 * 30) return { severity: sourceWeight >= 4 ? "medium" : "low", score: 56 };
  return { severity: "medium", score: 48 };
}

function latestRow(rows, keys = ["created_at"]) {
  return [...(rows || [])].sort((left, right) => {
    const leftAt = keys.map(key => timestamp(left?.[key])).find(Boolean) || 0;
    const rightAt = keys.map(key => timestamp(right?.[key])).find(Boolean) || 0;
    return rightAt - leftAt;
  })[0] || null;
}

function caseMap(cases) {
  return new Map((cases || []).map(row => [text(row?.signal_key), row]));
}

function ownerLaneFor(signal) {
  if (signal.category === "service_execution") return "Service runtime";
  if (signal.category === "event_processing" || signal.category === "runtime") return "Platform runtime";
  if (signal.category === "system_alert" && text(signal.alertType).toUpperCase() === "MISSING_RECIPE") return "Operations · production data";
  if (signal.category === "system_alert") return "Platform operations";
  if (signal.category === "security_incident") return "Platform engineering";
  if (signal.category === "wallet") return "Commercial operations";
  if (signal.category === "release_governance") return "Release governance";
  return "Platform operations";
}

function slaHoursFor(signal) {
  const sourceSeverity = text(signal.sourceSeverity || signal.severity).toLowerCase();
  if (signal.category === "service_execution" && signal.state === "live") return sourceSeverity === "critical" ? 1 : 4;
  if (sourceSeverity === "critical") return 4;
  if (sourceSeverity === "high") return 24;
  if (sourceSeverity === "medium" || sourceSeverity === "warning") return 72;
  return 168;
}

function applySla(signal, nowMs) {
  const startAt = signal.firstSeenAt || signal.occurredAt || signal.lastSeenAt;
  const age = ageHours(startAt, nowMs);
  const slaHours = slaHoursFor(signal);
  const dueAtMs = timestamp(startAt) ? timestamp(startAt) + slaHours * 3_600_000 : null;
  const remainingHours = dueAtMs === null ? null : (dueAtMs - nowMs) / 3_600_000;
  const dueState = remainingHours === null ? "unverified" : remainingHours < 0 ? "breached" : remainingHours <= 24 ? "due_today" : "within_sla";
  const ratio = age === null || !slaHours ? 0 : age / slaHours;
  const escalationLevel = ratio >= 4 ? "L3" : ratio >= 1 ? "L2" : ratio >= 0.5 ? "L1" : "none";
  return {
    ...signal,
    ownerLane: ownerLaneFor(signal),
    ageHours: age,
    slaHours,
    dueAt: dueAtMs === null ? null : new Date(dueAtMs).toISOString(),
    dueState,
    escalationLevel,
  };
}

function applyWorkflow(signal, persistedCase) {
  const evidenceLastSeen = timestamp(signal.lastSeenAt || signal.occurredAt);
  const resolvedAt = timestamp(persistedCase?.resolved_at);
  const reopenedByEvidence = persistedCase?.status === "RESOLVED" && evidenceLastSeen && resolvedAt && evidenceLastSeen > resolvedAt;
  const workflowStatus = reopenedByEvidence ? "OPEN" : text(persistedCase?.status || "OPEN").toUpperCase();
  return {
    ...signal,
    workflowStatus,
    reopenedByEvidence: Boolean(reopenedByEvidence),
    caseId: persistedCase?.id || null,
    acknowledgedAt: persistedCase?.acknowledged_at || null,
    resolvedAt: reopenedByEvidence ? null : persistedCase?.resolved_at || null,
    resolutionNote: reopenedByEvidence ? null : persistedCase?.resolution_note || null,
  };
}

function stateFromSignals(signals) {
  const active = signals.filter(signal => signal.workflowStatus !== "RESOLVED");
  if (active.some(signal => signal.severity === "critical")) return "critical";
  if (active.some(signal => signal.severity === "high")) return "attention";
  if (active.length) return "review";
  return "clear";
}

export default function buildPlatformOperatorControl({
  now = new Date(),
  organizations = [],
  health = {},
  usageFailureGroups = [],
  systemAlerts = [],
  securityIncidents = [],
  systemEvents = [],
  wallets = [],
  releaseHistory = {},
  operatorCases = [],
  coverage = [],
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const orgs = organizationMap(organizations);
  const cases = caseMap(operatorCases);
  const rawSignals = [];

  for (const group of usageFailureGroups || []) {
    const count = number(group?.occurrence_count);
    if (!count) continue;
    const organizationId = text(group?.organization_id) || null;
    const provider = text(group?.provider || "Runtime provider");
    const capability = text(group?.capability || "service execution");
    const lastSeenAt = group?.last_seen_at || null;
    const firstSeenAt = group?.first_seen_at || null;
    const hoursSinceLatest = ageHours(lastSeenAt, nowMs);
    const activelyRepeating = hoursSinceLatest !== null && hoursSinceLatest <= 1;
    const severity = activelyRepeating && count >= 25 ? "critical" : count >= 25 ? "high" : "medium";
    const score = severity === "critical" ? 100 : severity === "high" ? 90 : 72;
    const signalKey = text(group?.signal_key);

    rawSignals.push({
      id: signalKey,
      severity,
      sourceSeverity: severity,
      score,
      state: activelyRepeating ? "live" : "recent",
      category: "service_execution",
      title: `${provider} · ${capability} is failing${activelyRepeating ? " now" : ""}`,
      summary: `${count.toLocaleString("en-US")} matching failed execution${count === 1 ? "" : "s"} in the last 24 hours${organizationId ? ` · ${orgs.get(organizationId) || organizationId}` : ""}.`,
      organizationId,
      organizationName: organizationId ? orgs.get(organizationId) || organizationId : "Platform",
      source: "platform_service_usage",
      target: "issues",
      occurredAt: lastSeenAt,
      firstSeenAt,
      lastSeenAt,
      occurrenceCount: count,
      evidenceVersion: `${lastSeenAt || "unknown"}:${count}`,
      actionable: true,
      evidence: {
        occurrences24h: count,
        firstSeen: firstSeenAt,
        lastSeen: lastSeenAt,
        provider,
        capability,
        chargedTotal: number(group?.charged_amount_total),
        supplierCostTotal: number(group?.supplier_cost_total),
        latestError: text(group?.error_message) || null,
      },
    });
  }

  const runtimeState = text(health?.status || "unknown").toLowerCase();
  if (["degraded", "unverified", "partial"].includes(runtimeState)) {
    rawSignals.push({
      id: "runtime-health",
      severity: runtimeState === "degraded" ? "critical" : "high",
      sourceSeverity: runtimeState === "degraded" ? "critical" : "high",
      score: runtimeState === "degraded" ? 98 : 86,
      state: "live",
      category: "runtime",
      title: `Platform runtime is ${runtimeState}`,
      summary: "Runtime health is not in a fully verified operational state. Inspect demand, lease and heartbeat evidence before taking action.",
      organizationId: null,
      source: "checkSystemHealth",
      target: "runtime",
      occurredAt: health?.timestamp || null,
      actionable: false,
      evidence: { runtimeState, queueState: health?.services?.queue?.status || null, databaseState: health?.services?.database?.status || null },
    });
  }

  const unprocessedEvents = (systemEvents || []).filter(row => row?.processed !== true);
  if (unprocessedEvents.length) {
    const oldest = [...unprocessedEvents].sort((a, b) => (timestamp(a?.created_at) || 0) - (timestamp(b?.created_at) || 0))[0];
    const newest = latestRow(unprocessedEvents);
    const oldestHours = ageHours(oldest?.created_at, nowMs);
    rawSignals.push({
      id: "system-event-backlog",
      severity: oldestHours !== null && oldestHours > 24 ? "high" : "medium",
      sourceSeverity: oldestHours !== null && oldestHours > 24 ? "high" : "medium",
      score: oldestHours !== null && oldestHours > 24 ? 88 : 70,
      state: "open",
      category: "event_processing",
      title: "System event backlog is not draining",
      summary: `${unprocessedEvents.length} event${unprocessedEvents.length === 1 ? "" : "s"} remain unprocessed${oldestHours !== null ? `; the oldest is ${Math.floor(oldestHours)} hours old` : ""}.`,
      organizationId: text(oldest?.organization_id) || null,
      source: "system_events",
      target: "runtime",
      occurredAt: newest?.created_at || oldest?.created_at || null,
      firstSeenAt: oldest?.created_at || null,
      lastSeenAt: newest?.created_at || null,
      occurrenceCount: unprocessedEvents.length,
      actionable: false,
      evidence: { backlogCount: unprocessedEvents.length, oldestEventType: text(oldest?.type) || null, oldestCreatedAt: oldest?.created_at || null, oldestAttemptCount: number(oldest?.attempt_count), oldestError: text(oldest?.last_error) || null },
    });
  }

  const openAlerts = (systemAlerts || []).filter(row => !row?.resolved_at && text(row?.status || "OPEN").toUpperCase() !== "RESOLVED");
  for (const group of groupRows(openAlerts, row => `${text(row?.organization_id)}|${text(row?.title || row?.alert_type)}`)) {
    const latest = latestRow(group);
    const oldest = [...group].sort((a, b) => (timestamp(a?.created_at) || 0) - (timestamp(b?.created_at) || 0))[0];
    const sourceSeverity = group.reduce((best, row) => severityWeight(row?.severity) > severityWeight(best) ? row?.severity : best, "low");
    const ranked = recencySeverity(sourceSeverity, latest?.created_at, nowMs);
    const organizationId = text(latest?.organization_id) || null;
    const age = ageHours(latest?.created_at, nowMs);
    rawSignals.push({
      id: `system-alert:${text(latest?.title || latest?.alert_type)}:${organizationId || "platform"}`,
      severity: ranked.severity,
      sourceSeverity,
      score: ranked.score,
      state: age !== null && age > 24 * 30 ? "stale-open" : "open",
      category: "system_alert",
      alertType: text(latest?.alert_type),
      title: `${group.length} unresolved alert${group.length === 1 ? "" : "s"} · ${text(latest?.title || latest?.alert_type || "System alert")}`,
      summary: `${organizationId ? `${orgs.get(organizationId) || organizationId} · ` : ""}${text(latest?.message) || "Persisted system alert requires review."}${age !== null && age > 24 * 30 ? " Historical unresolved debt." : ""}`,
      organizationId,
      source: "system_alerts",
      target: "issues",
      occurredAt: latest?.created_at || null,
      firstSeenAt: oldest?.created_at || null,
      lastSeenAt: latest?.created_at || null,
      occurrenceCount: group.length,
      actionable: true,
      evidence: { openCount: group.length, persistedSeverity: sourceSeverity, latestAlertAt: latest?.created_at || null, alertType: text(latest?.alert_type) || null },
    });
  }

  const openIncidents = (securityIncidents || []).filter(row => !row?.resolved_at && !["RESOLVED", "CLOSED"].includes(text(row?.incident_status).toUpperCase()));
  for (const group of groupRows(openIncidents, row => `${text(row?.incident_type)}|${text(row?.incident_summary)}`)) {
    const latest = latestRow(group);
    const oldest = [...group].sort((a, b) => (timestamp(a?.created_at) || 0) - (timestamp(b?.created_at) || 0))[0];
    const sourceSeverity = group.reduce((best, row) => severityWeight(row?.severity) > severityWeight(best) ? row?.severity : best, "low");
    const ranked = recencySeverity(sourceSeverity, latest?.created_at, nowMs);
    const age = ageHours(latest?.created_at, nowMs);
    rawSignals.push({
      id: `security-incident:${text(latest?.incident_type)}:${text(latest?.incident_summary)}`,
      severity: ranked.severity,
      sourceSeverity,
      score: ranked.score + 1,
      state: age !== null && age > 24 * 30 ? "stale-open" : "open",
      category: "security_incident",
      title: `${group.length} unresolved incident${group.length === 1 ? "" : "s"} · ${text(latest?.incident_type || "Security incident")}`,
      summary: `${text(latest?.incident_summary) || "Persisted security incident requires review."}${age !== null && age > 24 * 30 ? " Historical unresolved debt is ranked below fresh impact." : ""}`,
      organizationId: text(latest?.organization_id) || null,
      source: "enterprise_security_incidents",
      target: "issues",
      occurredAt: latest?.created_at || null,
      firstSeenAt: oldest?.created_at || null,
      lastSeenAt: latest?.created_at || null,
      occurrenceCount: group.length,
      actionable: true,
      evidence: { openCount: group.length, persistedSeverity: sourceSeverity, latestIncidentAt: latest?.created_at || null },
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
    rawSignals.push({
      id: "active-wallet-blockers", severity: "high", sourceSeverity: "high", score: 80, state: "open", category: "wallet",
      title: `${walletBlockers.length} active wallet blocker${walletBlockers.length === 1 ? "" : "s"}`,
      summary: "Only wallets with real usage/charge history or invalid runtime policy are escalated. Dormant zero-balance wallets are excluded.",
      organizationId: text(latest?.organization_id) || null, source: "organization_wallets", target: "wallet",
      occurredAt: latest?.last_charge_at || latest?.updated_at || null, actionable: false,
      evidence: { blockerCount: walletBlockers.length },
    });
  }

  if (releaseHistory?.status !== "verified") {
    rawSignals.push({
      id: "release-history-unverified", severity: "medium", sourceSeverity: "medium", score: 62, state: "unverified", category: "release_governance",
      title: "Deployment history cannot be verified inside Platform",
      summary: "Build identity remains separate from deployment truth. Platform will not infer releases from Git commits while the authoritative deployment probe is unavailable.",
      organizationId: null, source: releaseHistory?.source || "release_history", target: "runtime", occurredAt: releaseHistory?.checkedAt || null, actionable: false,
      evidence: { source: releaseHistory?.source || null, error: text(releaseHistory?.error) || null },
    });
  }

  const signals = rawSignals
    .map(signal => applyWorkflow(applySla(signal, nowMs), cases.get(signal.id)))
    .sort((left, right) => {
      const leftResolved = left.workflowStatus === "RESOLVED" ? 1 : 0;
      const rightResolved = right.workflowStatus === "RESOLVED" ? 1 : 0;
      const leftDue = left.dueState === "breached" ? 0 : left.dueState === "due_today" ? 1 : 2;
      const rightDue = right.dueState === "breached" ? 0 : right.dueState === "due_today" ? 1 : 2;
      return leftResolved - rightResolved || leftDue - rightDue || right.score - left.score || (timestamp(right.occurredAt) || 0) - (timestamp(left.occurredAt) || 0);
    });

  const active = signals.filter(signal => signal.workflowStatus !== "RESOLVED");
  const counts = active.reduce((accumulator, signal) => {
    accumulator[signal.severity] = number(accumulator[signal.severity]) + 1;
    if (signal.dueState === "breached") accumulator.breached = number(accumulator.breached) + 1;
    if (signal.dueState === "due_today") accumulator.dueToday = number(accumulator.dueToday) + 1;
    return accumulator;
  }, { critical: 0, high: 0, medium: 0, low: 0, breached: 0, dueToday: 0 });
  const verifiedSources = (coverage || []).filter(source => source?.status === "verified").length;

  return {
    generatedAt: new Date(nowMs).toISOString(),
    status: stateFromSignals(signals),
    counts: { ...counts, total: active.length, resolved: signals.length - active.length },
    coverage: { verified: verifiedSources, total: (coverage || []).length, sources: coverage || [] },
    policy: "BREACHED_SLA_THEN_DUE_TODAY_THEN_LIVE_IMPACT_THEN_RUNTIME_THEN_ACTIVE_BLOCKERS_THEN_STALE_DEBT",
    signals,
  };
}