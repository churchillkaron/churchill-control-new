export const FINANCE_HUMAN_WORKFLOW_STAGES = Object.freeze([
  {
    id: "prepare",
    label: "Prepare",
    ownerRole: "PREPARER",
    statuses: ["NOT_STARTED", "READY", "IN_PROGRESS"],
    description: "Prepare the accounting work and attach the evidence needed for review.",
  },
  {
    id: "client",
    label: "Client",
    ownerRole: "CLIENT",
    statuses: ["WAITING_ON_CLIENT"],
    description: "A client dependency is outstanding. Keep it visible without treating it as internal work that can move now.",
  },
  {
    id: "review",
    label: "Review",
    ownerRole: "REVIEWER",
    statuses: ["READY_FOR_REVIEW"],
    description: "A reviewer must inspect the workpaper, evidence and conclusion before it can progress.",
  },
  {
    id: "changes",
    label: "Changes",
    ownerRole: "PREPARER",
    statuses: ["CHANGES_REQUESTED"],
    description: "The reviewer has returned the work to the preparer with explicit review points to resolve.",
  },
  {
    id: "partner",
    label: "Partner",
    ownerRole: "PARTNER",
    statuses: ["REVIEWED"],
    description: "Reviewed work is waiting for partner or manager clearance where the engagement requires it.",
  },
  {
    id: "close",
    label: "Close",
    ownerRole: "APPROVER",
    statuses: ["CLEARED", "COMPLETE"],
    description: "The governed work is clear and can feed period close, filing, reporting or final engagement completion.",
  },
]);

const STAGE_BY_STATUS = new Map(
  FINANCE_HUMAN_WORKFLOW_STAGES.flatMap((stage) =>
    stage.statuses.map((status) => [status, stage]),
  ),
);

export function normalizeFinanceWorkflowStatus(value) {
  return String(value || "").trim().toUpperCase();
}

export function resolveFinanceHumanWorkflowStage(status) {
  return STAGE_BY_STATUS.get(normalizeFinanceWorkflowStatus(status)) || null;
}

export function buildFinanceHumanWorkflowSummary({ clients = [], workItems = [] } = {}) {
  const counts = Object.fromEntries(
    FINANCE_HUMAN_WORKFLOW_STAGES.map((stage) => [stage.id, 0]),
  );

  for (const item of Array.isArray(workItems) ? workItems : []) {
    const stage = resolveFinanceHumanWorkflowStage(item?.status);
    if (stage) counts[stage.id] += 1;
  }

  for (const client of Array.isArray(clients) ? clients : []) {
    const workload = client?.workload || {};
    counts.prepare += Number(workload.in_preparation || 0);
    counts.client += Number(workload.waiting_on_client || 0);
    counts.review += Number(workload.ready_for_review || 0);
    counts.changes += Number(workload.changes_requested || 0);
    counts.partner += Number(workload.reviewed_pending_partner || 0);
  }

  return FINANCE_HUMAN_WORKFLOW_STAGES.map((stage) => ({
    ...stage,
    count: counts[stage.id] || 0,
  }));
}

export function financeHumanPriorityRank(item, today = null) {
  const status = normalizeFinanceWorkflowStatus(item?.status);
  const due = item?.due_at ? String(item.due_at).slice(0, 10) : null;

  if (status === "CHANGES_REQUESTED") return 0;
  if (status === "BLOCKED") return 1;
  if (due && today && due < today && status !== "WAITING_ON_CLIENT") return 2;
  if (due && today && due === today && status !== "WAITING_ON_CLIENT") return 3;
  if (status === "IN_PROGRESS") return 4;
  if (["READY", "NOT_STARTED"].includes(status)) return 5;
  if (status === "READY_FOR_REVIEW") return 6;
  if (status === "REVIEWED") return 7;
  if (status === "WAITING_ON_CLIENT") return 9;
  if (["CLEARED", "COMPLETE", "SKIPPED"].includes(status)) return 10;
  return 8;
}

export function resolveFinanceHumanNextAction(item, { today = null, viewerRole = null } = {}) {
  if (!item) {
    return {
      kind: "clear",
      stage: null,
      title: "Your queue is clear",
      detail: "There is no accounting work assigned to you that can move right now.",
    };
  }

  const status = normalizeFinanceWorkflowStatus(item.status);
  const due = item?.due_at ? String(item.due_at).slice(0, 10) : null;
  const clientName = item.client_name || "Client";
  const title = item.title || "accounting work";
  const role = String(viewerRole || "").trim().toUpperCase();
  const stage = resolveFinanceHumanWorkflowStage(status);

  if (status === "CHANGES_REQUESTED") {
    return { kind: "resume", stage: "changes", title: `Resolve review changes · ${title}`, detail: `${clientName} was returned from review. Resolve the review points, update the evidence and send it back to the reviewer.` };
  }
  if (status === "BLOCKED") {
    return { kind: "unblock", stage: "prepare", title: `Unblock · ${title}`, detail: item.blocked_reason || `${clientName} cannot progress until this dependency is resolved.` };
  }
  if (due && today && due < today && status !== "WAITING_ON_CLIENT") {
    return { kind: "overdue", stage: stage?.id || null, title: `Finish overdue work · ${title}`, detail: `${clientName} has been overdue since ${due}.` };
  }
  if (due && today && due === today && status !== "WAITING_ON_CLIENT") {
    return { kind: "due_today", stage: stage?.id || null, title: `Due today · ${title}`, detail: `${clientName} is due today and should move before lower-priority work.` };
  }
  if (status === "READY_FOR_REVIEW") {
    return { kind: "review", stage: "review", title: `Review · ${title}`, detail: `${clientName} is prepared and waiting for reviewer sign-off, evidence review or changes.` };
  }
  if (status === "REVIEWED") {
    return { kind: "partner", stage: "partner", title: `Clear reviewed work · ${title}`, detail: `${clientName} has passed review and is waiting for partner or manager clearance.` };
  }
  if (status === "WAITING_ON_CLIENT") {
    return { kind: "client_wait", stage: "client", title: `Waiting on client · ${title}`, detail: `${clientName} has an external dependency. Keep the request visible, but do not let it displace work the team can execute now.` };
  }
  if (status === "IN_PROGRESS") {
    return { kind: "continue", stage: "prepare", title: `Continue · ${title}`, detail: `${clientName} is already in progress. Finish the workpaper and evidence before switching context.` };
  }
  if (["READY", "NOT_STARTED"].includes(status)) {
    return { kind: "start", stage: "prepare", title: `Start · ${title}`, detail: role === "REVIEWER" ? `${clientName} is preparer work; reviewer capacity should stay focused on completed handoffs where possible.` : `${clientName} is ready for preparation.` };
  }

  return { kind: "open", stage: stage?.id || null, title: `Open · ${title}`, detail: `${clientName} requires an accounting decision or handoff.` };
}
