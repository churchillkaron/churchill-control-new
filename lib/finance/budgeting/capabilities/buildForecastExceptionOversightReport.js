import {
  listForecastExceptionCases,
  syncForecastExceptionEscalations,
} from "../repositories/ForecastExceptionCaseRepository";
import buildForecastManagementExceptionsReport from "./buildForecastManagementExceptionsReport";

const DAY_MS = 24 * 60 * 60 * 1000;
const ESCALATION_ORDER = { CRITICAL: 0, ESCALATED: 1, ATTENTION: 2, NONE: 3 };

function dayStamp(value) {
  if (!value) return null;
  const source = String(value).length === 10 ? `${value}T00:00:00.000Z` : value;
  const timestamp = Date.parse(source);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function wholeDaysBetween(start, end) {
  const startStamp = dayStamp(start);
  const endStamp = dayStamp(end);
  if (startStamp === null || endStamp === null) return null;
  return Math.max(Math.floor((endStamp - startStamp) / DAY_MS), 0);
}

function finiteAverage(values) {
  const finite = values.filter(value => Number.isFinite(value));
  if (!finite.length) return null;
  return Number((finite.reduce((sum, value) => sum + value, 0) / finite.length).toFixed(1));
}

function activeQueueRow(item, caseRow, today) {
  const management = item.management || {};
  const status = String(management.status || "OPEN").toUpperCase();
  const persisted = Boolean(caseRow);
  const ageDays = persisted ? wholeDaysBetween(caseRow.created_at, today) : null;
  const dueDate = management.due_date || caseRow?.due_date || null;
  const overdue = Boolean(status !== "RESOLVED" && dueDate && String(dueDate) < today);
  const dueToday = Boolean(status !== "RESOLVED" && dueDate && String(dueDate) === today);
  const daysOverdue = overdue ? wholeDaysBetween(dueDate, today) : 0;

  return {
    case_id: caseRow?.id || null,
    occurrence_key: item.occurrence_key,
    entity_id: item.entity_id,
    entity_name: item.entity_name,
    exception_type: item.type,
    severity: item.severity,
    title: item.title,
    detail: item.detail,
    recommended_action: item.recommended_action,
    status,
    persisted,
    assigned_to: management.assigned_to || caseRow?.assigned_to || null,
    assigned_to_name: management.assigned_to_name || caseRow?.assigned_to_name || null,
    due_date: dueDate,
    overdue,
    due_today: dueToday,
    days_overdue: daysOverdue,
    age_days: ageDays,
    age_basis: persisted ? "governed_case_created_at" : "not_yet_governed",
    case_created_at: caseRow?.created_at || null,
    acknowledged_at: management.acknowledged_at || caseRow?.acknowledged_at || null,
    resolved_at: management.resolved_at || caseRow?.resolved_at || null,
    resolution_note: management.resolution_note || caseRow?.resolution_note || null,
    escalation_level: caseRow?.escalation_level || "NONE",
    escalation_reason: caseRow?.escalation_reason || null,
    escalation_changed_at: caseRow?.escalation_changed_at || null,
    escalation_revision: Number(caseRow?.escalation_revision || 0),
  };
}

function sortDue(left, right) {
  const escalationDelta =
    (ESCALATION_ORDER[left.escalation_level] ?? 99) -
    (ESCALATION_ORDER[right.escalation_level] ?? 99);
  if (escalationDelta !== 0) return escalationDelta;
  if (left.overdue !== right.overdue) return left.overdue ? -1 : 1;
  if (left.due_today !== right.due_today) return left.due_today ? -1 : 1;
  if (left.due_date && right.due_date) {
    const dateDelta = String(left.due_date).localeCompare(String(right.due_date));
    if (dateDelta !== 0) return dateDelta;
  } else if (left.due_date) {
    return -1;
  } else if (right.due_date) {
    return 1;
  }
  return String(left.entity_name || "").localeCompare(String(right.entity_name || ""));
}

function sortAging(left, right) {
  const escalationDelta =
    (ESCALATION_ORDER[left.escalation_level] ?? 99) -
    (ESCALATION_ORDER[right.escalation_level] ?? 99);
  if (escalationDelta !== 0) return escalationDelta;
  const leftAge = Number.isFinite(left.age_days) ? left.age_days : -1;
  const rightAge = Number.isFinite(right.age_days) ? right.age_days : -1;
  if (rightAge !== leftAge) return rightAge - leftAge;
  return String(left.entity_name || "").localeCompare(String(right.entity_name || ""));
}

function buildOwnerWorkload(unresolved) {
  const owners = new Map();

  for (const item of unresolved) {
    if (!item.assigned_to) continue;
    const key = String(item.assigned_to);
    const current = owners.get(key) || {
      assigned_to: item.assigned_to,
      assigned_to_name: item.assigned_to_name || "Finance User",
      unresolved: 0,
      critical: 0,
      warning: 0,
      informational: 0,
      overdue: 0,
      due_today: 0,
      without_due_date: 0,
      attention: 0,
      escalated: 0,
      critical_escalations: 0,
      oldest_age_days: null,
    };

    current.unresolved += 1;
    if (item.severity === "critical") current.critical += 1;
    else if (item.severity === "warning") current.warning += 1;
    else current.informational += 1;
    if (item.overdue) current.overdue += 1;
    if (item.due_today) current.due_today += 1;
    if (!item.due_date) current.without_due_date += 1;
    if (item.escalation_level === "ATTENTION") current.attention += 1;
    if (item.escalation_level === "ESCALATED") current.escalated += 1;
    if (item.escalation_level === "CRITICAL") current.critical_escalations += 1;
    if (Number.isFinite(item.age_days)) {
      current.oldest_age_days = current.oldest_age_days === null
        ? item.age_days
        : Math.max(current.oldest_age_days, item.age_days);
    }

    owners.set(key, current);
  }

  return [...owners.values()].sort((left, right) => {
    if (right.critical_escalations !== left.critical_escalations) {
      return right.critical_escalations - left.critical_escalations;
    }
    if (right.escalated !== left.escalated) return right.escalated - left.escalated;
    if (right.overdue !== left.overdue) return right.overdue - left.overdue;
    if (right.unresolved !== left.unresolved) return right.unresolved - left.unresolved;
    return String(left.assigned_to_name || "").localeCompare(String(right.assigned_to_name || ""));
  });
}

function resolvedHistoryRow(caseRow, today) {
  const resolutionDays = wholeDaysBetween(caseRow.created_at, caseRow.resolved_at);
  return {
    case_id: caseRow.id,
    occurrence_key: caseRow.occurrence_key,
    entity_id: caseRow.entity_id,
    exception_type: caseRow.exception_type,
    severity: caseRow.exception_severity,
    title: caseRow.exception_title,
    assigned_to: caseRow.assigned_to,
    assigned_to_name: caseRow.assigned_to_name,
    created_at: caseRow.created_at,
    resolved_at: caseRow.resolved_at,
    resolution_note: caseRow.resolution_note,
    resolution_days: resolutionDays,
    days_since_resolution: wholeDaysBetween(caseRow.resolved_at, today),
    escalation_revision: Number(caseRow.escalation_revision || 0),
  };
}

function documentRows(rows, emptyLabel) {
  if (!rows.length) return [{ label: emptyLabel, value: "None" }];
  return rows.map(row => ({
    label: `${row.entity_name || row.assigned_to_name || "Finance"} — ${row.title || "Forecast Exceptions"}`,
    value: [
      row.escalation_level && row.escalation_level !== "NONE" ? row.escalation_level : null,
      row.status,
      row.severity?.toUpperCase(),
      row.due_date ? `Due ${row.due_date}` : "No due date",
      row.overdue ? `${row.days_overdue} day(s) overdue` : null,
      Number.isFinite(row.age_days) ? `${row.age_days} governed day(s)` : "Not yet governed",
    ].filter(Boolean).join(" · "),
  }));
}

export default async function buildForecastExceptionOversightReport({
  organizationId,
  limit = 12,
} = {}) {
  if (!organizationId) throw new Error("organizationId required");

  const escalationSync = await syncForecastExceptionEscalations({ organizationId });
  const [exceptionsReport, cases] = await Promise.all([
    buildForecastManagementExceptionsReport({ organizationId, limit }),
    listForecastExceptionCases({ organizationId }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const caseByOccurrence = new Map((cases || []).map(row => [row.occurrence_key, row]));
  const active = (exceptionsReport.exceptions || []).map(item =>
    activeQueueRow(item, caseByOccurrence.get(item.occurrence_key) || null, today)
  );
  const unresolved = active.filter(item => item.status !== "RESOLVED");
  const resolvedActive = active.filter(item => item.status === "RESOLVED");
  const governedUnresolved = unresolved.filter(item => item.persisted && Number.isFinite(item.age_days));
  const ownerWorkload = buildOwnerWorkload(unresolved);
  const resolvedHistory = (cases || [])
    .filter(row => row.status === "RESOLVED" && row.resolved_at)
    .map(row => resolvedHistoryRow(row, today))
    .sort((left, right) => String(right.resolved_at || "").localeCompare(String(left.resolved_at || "")));

  const queues = {
    critical_escalations: unresolved.filter(item => item.escalation_level === "CRITICAL").sort(sortDue),
    escalated: unresolved.filter(item => item.escalation_level === "ESCALATED").sort(sortDue),
    attention: unresolved.filter(item => item.escalation_level === "ATTENTION").sort(sortDue),
    overdue: unresolved.filter(item => item.overdue).sort(sortDue),
    due_today: unresolved.filter(item => item.due_today).sort(sortDue),
    unassigned: unresolved.filter(item => !item.assigned_to).sort(sortDue),
    open_unacknowledged: unresolved.filter(item => item.status === "OPEN").sort(sortDue),
    acknowledged: unresolved.filter(item => item.status === "ACKNOWLEDGED").sort(sortDue),
    without_due_date: unresolved.filter(item => !item.due_date).sort(sortAging),
    unresolved_aging: [...unresolved].sort(sortAging),
    resolved_active: resolvedActive.sort(sortAging),
  };

  const summary = {
    active_exceptions: active.length,
    unresolved_exceptions: unresolved.length,
    resolved_active_conditions: resolvedActive.length,
    critical_unresolved: unresolved.filter(item => item.severity === "critical").length,
    warning_unresolved: unresolved.filter(item => item.severity === "warning").length,
    informational_unresolved: unresolved.filter(item => item.severity === "info").length,
    attention_escalations: queues.attention.length,
    escalated_exceptions: queues.escalated.length,
    critical_escalations: queues.critical_escalations.length,
    open_unacknowledged: queues.open_unacknowledged.length,
    acknowledged_unresolved: queues.acknowledged.length,
    assigned_unresolved: unresolved.filter(item => item.assigned_to).length,
    unassigned_unresolved: queues.unassigned.length,
    overdue_unresolved: queues.overdue.length,
    due_today_unresolved: queues.due_today.length,
    without_due_date_unresolved: queues.without_due_date.length,
    not_yet_governed: unresolved.filter(item => !item.persisted).length,
    owners_with_unresolved_work: ownerWorkload.length,
    average_governed_age_days: finiteAverage(governedUnresolved.map(item => item.age_days)),
    oldest_governed_age_days: governedUnresolved.length
      ? Math.max(...governedUnresolved.map(item => item.age_days))
      : null,
    resolved_case_history: resolvedHistory.length,
    average_resolution_days: finiteAverage(
      resolvedHistory.map(item => item.resolution_days).filter(value => Number.isFinite(value))
    ),
  };

  const generatedAt = new Date().toISOString();
  const document = {
    title: "Forecast Exception Oversight",
    entity: { id: null, name: "Organization Forecast Controls" },
    period: { id: null, name: "Current active exception occurrences and governed case history" },
    currency: { code: null },
    sections: [
      {
        title: "Executive Control Summary",
        rows: [
          { label: "Active Exceptions", value: String(summary.active_exceptions) },
          { label: "Unresolved", value: String(summary.unresolved_exceptions) },
          { label: "Critical Escalations", value: String(summary.critical_escalations) },
          { label: "Escalated", value: String(summary.escalated_exceptions) },
          { label: "Attention", value: String(summary.attention_escalations) },
          { label: "Overdue", value: String(summary.overdue_unresolved) },
          { label: "Unassigned", value: String(summary.unassigned_unresolved) },
          { label: "Not Yet Governed", value: String(summary.not_yet_governed) },
          { label: "Owners With Unresolved Work", value: String(summary.owners_with_unresolved_work) },
          { label: "Oldest Governed Age", value: summary.oldest_governed_age_days === null ? "Unavailable" : `${summary.oldest_governed_age_days} day(s)` },
        ],
      },
      {
        title: "Owner Workload",
        rows: ownerWorkload.length
          ? ownerWorkload.map(owner => ({
              label: owner.assigned_to_name,
              value: `${owner.unresolved} unresolved · ${owner.escalated} escalated · ${owner.overdue} overdue · ${owner.critical} critical source exceptions`,
            }))
          : [{ label: "Assigned Forecast Exceptions", value: "None" }],
      },
      { title: "Critical Escalation Queue", rows: documentRows(queues.critical_escalations, "Critical Escalations") },
      { title: "Escalated Queue", rows: documentRows(queues.escalated, "Escalated Exceptions") },
      { title: "Attention Queue", rows: documentRows(queues.attention, "Attention Exceptions") },
      { title: "Overdue Queue", rows: documentRows(queues.overdue, "Overdue Exceptions") },
      { title: "Unassigned Queue", rows: documentRows(queues.unassigned, "Unassigned Exceptions") },
      { title: "Unresolved Aging", rows: documentRows(queues.unresolved_aging, "Unresolved Exceptions") },
      {
        title: "Control Semantics",
        rows: [
          { label: "Attention", value: "A governed unresolved case is unassigned or due today" },
          { label: "Escalated", value: "A governed unresolved case is overdue and has an assigned owner" },
          { label: "Critical Escalation", value: "A governed unresolved case is both overdue and unassigned" },
          { label: "Escalation Audit", value: "Only escalation state changes are persisted and recorded in the canonical Finance audit log" },
          { label: "Aging", value: "Exact calendar days from governed case creation; unpersisted active exceptions are explicitly marked not yet governed" },
          { label: "No Arbitrary Thresholds", value: "Escalation is based only on ownership, case lifecycle and due-date facts; forecast-error percentages and invented aging thresholds are not used" },
          { label: "Source", value: "Canonical Forecast Management Exceptions plus governed finance_forecast_exception_cases workflow state" },
        ],
      },
    ],
    generated_at: generatedAt,
  };

  return {
    success: true,
    organization_id: organizationId,
    history_limit: exceptionsReport.history_limit || limit,
    escalation_sync: escalationSync,
    summary,
    owner_workload: ownerWorkload,
    queues,
    resolved_history: resolvedHistory.slice(0, 25),
    document,
    generated_at: generatedAt,
  };
}
