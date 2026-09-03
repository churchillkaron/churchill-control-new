const DAY_MS = 24 * 60 * 60 * 1000;

const TERMINAL_STATUSES = new Set(["ACCEPTED", "CLOSED", "COMPLETE", "COMPLETED"]);
const RESPONSE_STATUSES = new Set(["SUBMITTED", "RESPONDED", "RECEIVED"]);
const REMINDER_INTERVALS = Object.freeze({ DAILY: 1, EVERY_2_DAYS: 2, EVERY_TWO_DAYS: 2, WEEKLY: 7 });

function normalized(value) {
  return String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function dateKey(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function addDaysKey(value, days) {
  if (!value || !Number.isFinite(days)) return null;
  const parsed = new Date(`${dateKey(value)}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function hasValue(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

export function financeClientReminderIntervalDays(policy) {
  if (policy && typeof policy === "object") {
    if (policy.enabled === false) return null;
    const explicit = Number(policy.interval_days ?? policy.cadence_days ?? policy.days);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const mode = normalized(policy.mode || policy.cadence);
    if (["MANUAL", "MANUAL_UNTIL_SENT", "NONE", "OFF", "DISABLED"].includes(mode)) return null;
    return REMINDER_INTERVALS[mode] || null;
  }

  const value = normalized(policy);
  if (!value || ["MANUAL", "NONE", "OFF", "DISABLED"].includes(value)) return null;
  return REMINDER_INTERVALS[value] || null;
}

export function financeClientRequestHasResponse(request) {
  return Boolean(
    request?.submitted_at ||
      hasValue(request?.client_response) ||
      RESPONSE_STATUSES.has(normalized(request?.status)),
  );
}

export function resolveFinanceClientDependency(request, { workItem = null, today = null } = {}) {
  const currentDay = today || new Date().toISOString().slice(0, 10);
  const workTitle = workItem?.title || "Accounting work";

  if (!request) {
    return {
      state: "REQUEST_MISSING",
      priority: 1,
      title: "Client request is missing",
      detail: `${workTitle} is waiting on an external dependency, but no governed client request is attached.`,
      nextAction: "Create or reconnect the client request",
      nextActionKind: "create_request",
      safeToFollowUp: false,
      shouldWait: false,
      blocks: `${workTitle} cannot progress until the client dependency is resolved.`,
    };
  }

  const requestStatus = normalized(request.status);
  const due = dateKey(request.due_at);
  const sent = dateKey(request.sent_at);
  const overdue = Boolean(due && due < currentDay);
  const accepted = Boolean(request.accepted_at) || TERMINAL_STATUSES.has(requestStatus);

  if (accepted) {
    return {
      state: "ACCEPTED",
      priority: 9,
      title: "Client dependency accepted",
      detail: "The client handoff is complete. No further chase is appropriate.",
      nextAction: "Continue the accounting workflow",
      nextActionKind: "continue_work",
      safeToFollowUp: false,
      shouldWait: false,
      overdue: false,
      blocks: null,
    };
  }

  if (financeClientRequestHasResponse(request)) {
    return {
      state: "CLIENT_RESPONDED",
      priority: 0,
      title: "Client responded - review the evidence",
      detail: "A submission or response is recorded. Review what the client supplied before any further reminder is considered.",
      nextAction: "Review the client response",
      nextActionKind: "review_response",
      safeToFollowUp: false,
      shouldWait: false,
      overdue,
      blocks: `${workTitle} stays outside review or clearance until the response is assessed.`,
    };
  }

  if (!sent || requestStatus === "DRAFT") {
    return {
      state: "NOT_ISSUED",
      priority: 1,
      title: "Client request has not been issued",
      detail: "The request exists, but there is no recorded client handoff yet.",
      nextAction: "Issue the governed client request",
      nextActionKind: "issue_request",
      safeToFollowUp: false,
      shouldWait: false,
      overdue,
      blocks: `${workTitle} cannot progress until the client receives the request.`,
    };
  }

  const intervalDays = financeClientReminderIntervalDays(request.reminder_policy);
  if (!intervalDays) {
    return {
      state: overdue ? "MANUAL_FOLLOW_UP" : "WAITING_MANUAL",
      priority: overdue ? 2 : 8,
      title: overdue ? "Client dependency is overdue" : "Waiting on client - no automatic chase",
      detail: overdue
        ? "The due date has passed. Follow-up needs a human decision because this request is not on an automatic reminder cadence."
        : "The client has already been contacted. Keep the dependency visible without generating duplicate communication.",
      nextAction: overdue ? "Decide whether to follow up on the existing request" : "Wait for the client response",
      nextActionKind: overdue ? "manual_follow_up" : "wait",
      safeToFollowUp: overdue,
      shouldWait: !overdue,
      overdue,
      lastContactAt: sent,
      nextEligibleFollowUpAt: null,
      blocks: `${workTitle} remains blocked by the client dependency.`,
    };
  }

  const nextEligibleFollowUpAt = addDaysKey(request.sent_at, intervalDays);
  if (!nextEligibleFollowUpAt || currentDay < nextEligibleFollowUpAt) {
    return {
      state: "WAITING_NO_CHASE",
      priority: 8,
      title: "Waiting on client - do not chase yet",
      detail: nextEligibleFollowUpAt
        ? `The client was already contacted. The next reminder window opens ${nextEligibleFollowUpAt}.`
        : "The client was already contacted and another reminder is not yet justified.",
      nextAction: "Wait until the next governed reminder window",
      nextActionKind: "wait",
      safeToFollowUp: false,
      shouldWait: true,
      overdue,
      lastContactAt: sent,
      nextEligibleFollowUpAt,
      blocks: `${workTitle} remains blocked by the client dependency.`,
    };
  }

  return {
    state: "FOLLOW_UP_DUE",
    priority: overdue ? 2 : 3,
    title: overdue ? "Client follow-up is due and overdue" : "Client follow-up window is open",
    detail: "No response is recorded and the configured reminder interval has elapsed. Follow up on the existing request rather than creating a duplicate request.",
    nextAction: "Follow up on the existing client request",
    nextActionKind: "follow_up_existing_request",
    safeToFollowUp: true,
    shouldWait: false,
    overdue,
    lastContactAt: sent,
    nextEligibleFollowUpAt,
    blocks: `${workTitle} remains blocked by the client dependency.`,
  };
}

export function buildFinanceClientDependencySummary(workItems = []) {
  const dependencies = (Array.isArray(workItems) ? workItems : [])
    .filter((item) => item?.client_dependency)
    .map((item) => ({ item, analysis: item.client_dependency }))
    .sort((a, b) => Number(a.analysis.priority ?? 99) - Number(b.analysis.priority ?? 99));

  return {
    dependencies,
    next: dependencies.find((row) => !row.analysis.shouldWait && row.analysis.state !== "ACCEPTED") || null,
    counts: {
      total: dependencies.length,
      action_due: dependencies.filter((row) => ["CLIENT_RESPONDED", "NOT_ISSUED", "REQUEST_MISSING", "FOLLOW_UP_DUE", "MANUAL_FOLLOW_UP"].includes(row.analysis.state)).length,
      client_responded: dependencies.filter((row) => row.analysis.state === "CLIENT_RESPONDED").length,
      follow_up_due: dependencies.filter((row) => ["FOLLOW_UP_DUE", "MANUAL_FOLLOW_UP"].includes(row.analysis.state)).length,
      do_not_chase: dependencies.filter((row) => ["WAITING_NO_CHASE", "WAITING_MANUAL"].includes(row.analysis.state)).length,
    },
  };
}
