const COMPLETE_STATUSES = new Set([
  "COMPLETE",
  "COMPLETED",
  "CLEARED",
  "CLOSED",
  "DONE",
  "POSTED",
  "SUBMITTED",
  "APPROVED",
  "SKIPPED",
]);

const WAITING_STATUSES = new Set([
  "WAITING_ON_CLIENT",
  "WAITING",
  "SENT",
  "VIEWED",
]);

const BLOCKED_STATUSES = new Set([
  "BLOCKED",
  "FAILED",
  "ERROR",
  "SYSTEM_BLOCKED",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function complete(status) {
  return COMPLETE_STATUSES.has(upper(status));
}

function defaultOwner(kind) {
  if (kind === "review") return "Reviewer";
  if (kind === "approval") return "Approver";
  if (kind === "reconciliation") return "Accounting";
  if (kind === "filing") return "Tax / Accounting";
  if (kind === "close") return "Controller";
  if (kind === "client") return "Client / Accountant";
  return "Accounting";
}

function actionState(item) {
  const status = upper(item?.status);
  if (BLOCKED_STATUSES.has(status)) return "BLOCKED";
  if (WAITING_STATUSES.has(status)) return "WAITING";
  if (complete(status)) return "COMPLETE";
  if (status === "CHANGES_REQUESTED") return "ACTION_REQUIRED";
  if (item?.priority === "attention" || item?.priority === "review") return "ACTION_REQUIRED";
  return "ACTION_REQUIRED";
}

function actionRank(state, kind, priority) {
  if (state === "BLOCKED") return 0;
  if (state === "ACTION_REQUIRED" && priority === "attention") return 10;
  if (state === "ACTION_REQUIRED" && kind === "review") return 20;
  if (state === "ACTION_REQUIRED") return 30;
  if (state === "WAITING") return 80;
  if (state === "COMPLETE") return 100;
  return 90;
}

export function normalizeFinanceAction(item, defaults = {}) {
  const kind = clean(item?.kind || defaults.kind || "work").toLowerCase();
  const state = actionState(item || {});
  const priority = clean(item?.priority || defaults.priority || "review").toLowerCase();

  return {
    id: clean(item?.id || defaults.id || `${kind}:${clean(item?.title || "finance-action")}`),
    kind,
    title: clean(item?.title || defaults.title || "Finance work"),
    detail: clean(item?.detail || defaults.detail || "Accounting control requires attention"),
    status: clean(item?.status || defaults.status || "OPEN"),
    state,
    rank: actionRank(state, kind, priority),
    priority,
    href: clean(item?.href || defaults.href || "/finance/work"),
    owner: clean(item?.owner || defaults.owner || defaultOwner(kind)),
    due_at: item?.due_at || defaults.due_at || null,
    source: clean(item?.source || defaults.source || "finance"),
    evidence_required: item?.evidence_required === true || defaults.evidence_required === true,
    evidence_present: item?.evidence_present === true || defaults.evidence_present === true,
  };
}

export function buildFinanceActionSet(commandCenter) {
  const queue = Array.isArray(commandCenter?.queue) ? commandCenter.queue : [];
  return queue
    .map((item) => normalizeFinanceAction(item))
    .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
}

function controlState({ blocked = false, action = false, ready = false }) {
  if (blocked) return "BLOCKED";
  if (action) return "ACTION_REQUIRED";
  if (ready) return "READY";
  return "ON_TRACK";
}

export function buildFinanceContinuousCloseState(commandCenter) {
  const metrics = commandCenter?.metrics || {};
  const close = commandCenter?.close || { steps: [], completed: 0, total: 0, progress: 0 };
  const sources = commandCenter?.sources || {};
  const periodStatus = upper(commandCenter?.context?.period_status);
  const periodClosed = ["CLOSED", "LOCKED"].includes(periodStatus) || upper(close?.run?.status) === "CLOSED";
  const sourceRows = Object.values(sources || {});
  const sourceErrors = sourceRows.filter((row) => row?.status === "error").length;
  const actions = buildFinanceActionSet(commandCenter);
  const openCloseSteps = (close.steps || []).filter((step) => !step?.complete).length;

  const reconciliationCount = number(metrics.reconciliation?.count);
  const reconciliationDifference = Math.abs(number(metrics.reconciliation?.difference));
  const reviewReady = number(metrics.review?.ready);
  const reviewChanges = number(metrics.review?.changes_requested);
  const reviewOverdue = number(metrics.review?.overdue);
  const approvals = number(metrics.approvals?.count);
  const filings = number(metrics.filings?.count);
  const filingsOverdue = number(metrics.filings?.overdue);

  const controls = [
    {
      id: "bank",
      label: "Bank reconciliation",
      state: controlState({
        blocked: reconciliationDifference > 0.000001,
        action: reconciliationCount > 0,
        ready: reconciliationCount === 0,
      }),
      detail: reconciliationCount > 0
        ? `${reconciliationCount} open · ${reconciliationDifference} unresolved difference`
        : "No surfaced reconciliation exception",
      href: "/finance/bank-reconciliation",
    },
    {
      id: "review",
      label: "Accounting review",
      state: controlState({
        blocked: reviewChanges > 0 || reviewOverdue > 0,
        action: reviewReady > 0,
        ready: number(metrics.review?.count) === 0,
      }),
      detail: `${reviewReady} ready · ${reviewChanges} changes · ${reviewOverdue} overdue`,
      href: "/finance/review",
    },
    {
      id: "approvals",
      label: "Finance approvals",
      state: controlState({ action: approvals > 0, ready: approvals === 0 }),
      detail: approvals > 0 ? `${approvals} decision${approvals === 1 ? "" : "s"} pending` : "No pending finance decision",
      href: "/finance/work",
    },
    {
      id: "filings",
      label: "Statutory filings",
      state: controlState({ blocked: filingsOverdue > 0, action: filings > 0, ready: filings === 0 }),
      detail: filings > 0 ? `${filings} open · ${filingsOverdue} overdue` : "No surfaced filing exception",
      href: "/finance/statutory-filings",
    },
    {
      id: "close",
      label: "Close procedures",
      state: controlState({
        action: openCloseSteps > 0 || number(close.total) === 0,
        ready: number(close.total) > 0 && openCloseSteps === 0,
      }),
      detail: number(close.total) > 0
        ? `${number(close.completed)}/${number(close.total)} complete · ${openCloseSteps} remaining`
        : "Close procedures not started",
      href: "/finance/close",
    },
    {
      id: "sources",
      label: "Control-source integrity",
      state: controlState({ blocked: sourceErrors > 0, ready: sourceErrors === 0 }),
      detail: sourceRows.length
        ? `${sourceRows.length - sourceErrors}/${sourceRows.length} truth sources connected`
        : "No control-source signal available",
      href: "/finance/close",
    },
  ];

  const blockedControls = controls.filter((control) => control.state === "BLOCKED");
  const actionControls = controls.filter((control) => control.state === "ACTION_REQUIRED");
  const readyControls = controls.filter((control) => control.state === "READY");
  const nextAction = actions.find((action) => action.state === "BLOCKED" || action.state === "ACTION_REQUIRED") || null;

  let state = "ON_TRACK";
  let title = "Building close readiness continuously";
  let detail = "Routine accounting is feeding the close; no hard close blocker is currently surfaced.";

  if (periodClosed) {
    state = "CLOSED";
    title = "Period closed";
    detail = "The selected accounting period is closed or locked.";
  } else if (blockedControls.length > 0) {
    state = "BLOCKED";
    title = "Close readiness has a blocker";
    detail = `${blockedControls.length} control area${blockedControls.length === 1 ? "" : "s"} must be resolved before final close can be trusted.`;
  } else if (actionControls.length > 0 || nextAction) {
    state = "ACTION_REQUIRED";
    title = "Close readiness is moving, but work remains";
    detail = nextAction
      ? `${nextAction.title} is the highest-ranked accounting action right now.`
      : `${actionControls.length} control area${actionControls.length === 1 ? "" : "s"} still need human work.`;
  } else if (number(close.total) > 0 && openCloseSteps === 0) {
    state = "READY";
    title = "Close-ready now";
    detail = "The surfaced close procedures and accounting control areas are clear for the selected period.";
  }

  return {
    state,
    title,
    detail,
    controls,
    actions,
    next_action: nextAction,
    ready_controls: readyControls.length,
    total_controls: controls.length,
    blocked_controls: blockedControls.length,
    action_controls: actionControls.length,
    source_errors: sourceErrors,
    period_closed: periodClosed,
  };
}
