const REVIEW_WORK_STATUSES = new Set([
  "READY_FOR_REVIEW",
  "CHANGES_REQUESTED",
  "READY",
  "IN_PROGRESS",
  "BLOCKED",
  "WAITING_ON_CLIENT",
]);

const REVIEW_ROLES = new Set(["REVIEWER", "PARTNER"]);
const OPEN_CLIENT_REQUEST_STATUSES = new Set([
  "DRAFT",
  "SENT",
  "VIEWED",
  "IN_PROGRESS",
  "SUBMITTED",
  "CHANGES_REQUESTED",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : null;
}

function isOverdue(value, today) {
  const due = dateOnly(value);
  return Boolean(due && today && due < today);
}

function hours(minutes) {
  return Math.round((Math.max(0, Number(minutes || 0)) / 60) * 10) / 10;
}

function mapBy(rows, key) {
  return new Map((rows || []).filter((row) => row?.[key]).map((row) => [row[key], row]));
}

function groupBy(rows, key) {
  const grouped = new Map();
  for (const row of rows || []) {
    const value = row?.[key];
    if (!value) continue;
    if (!grouped.has(value)) grouped.set(value, []);
    grouped.get(value).push(row);
  }
  return grouped;
}

function assignedOwner(item, profile) {
  const status = upper(item.status);
  const role = upper(item.required_role);
  if (status === "READY_FOR_REVIEW") return profile?.assigned_reviewer_id || null;
  if (role === "REVIEWER") return item.assigned_to || profile?.assigned_reviewer_id || null;
  if (role === "PARTNER") return item.assigned_to || profile?.assigned_partner_id || null;
  return item.assigned_to || null;
}

function assignedOwnerName(item, profile) {
  const ownerId = assignedOwner(item, profile);
  if (!ownerId) return null;
  if (ownerId === profile?.assigned_reviewer_id) return profile?.assigned_reviewer_name || null;
  if (ownerId === profile?.assigned_partner_id) return profile?.assigned_partner_name || null;
  return null;
}

function handoffState(item) {
  if (upper(item.status) !== "READY_FOR_REVIEW") return null;
  const snapshot = item.metadata?.review_handoff_preflight;
  if (!snapshot || snapshot.ready !== true) return "LIVE_PREFLIGHT_REQUIRED";
  if (snapshot.work_item_id && snapshot.work_item_id !== item.id) return "LIVE_PREFLIGHT_REQUIRED";
  if (item.finance_review_item_id && snapshot.review_item_id && snapshot.review_item_id !== item.finance_review_item_id) {
    return "LIVE_PREFLIGHT_REQUIRED";
  }
  if (snapshot.controls?.ledger_population_complete !== true) return "LIVE_PREFLIGHT_REQUIRED";
  if (Number(snapshot.controls?.open_review_points || 0) > 0) return "LIVE_PREFLIGHT_REQUIRED";
  if (Number(snapshot.controls?.approval_pending || 0) > 0) return "LIVE_PREFLIGHT_REQUIRED";
  if (Array.isArray(snapshot.blockers) && snapshot.blockers.length) return "LIVE_PREFLIGHT_REQUIRED";
  return "VERIFIED_HANDOFF";
}

function queueStage(item) {
  const status = upper(item.status);
  const role = upper(item.required_role);
  const systemGate = item.metadata?.system_gate;
  if (status === "CHANGES_REQUESTED") return "RETURNED";
  if (status === "WAITING_ON_CLIENT") return "WAITING_ON_CLIENT";
  if (status === "BLOCKED" || clean(item.blocked_reason) || (systemGate?.applicable === true && systemGate?.satisfied === false)) {
    return "BLOCKED";
  }
  const handoff = handoffState(item);
  if (handoff) return handoff;
  if (role === "PARTNER" && ["READY", "IN_PROGRESS"].includes(status)) return "PARTNER_CLEARANCE";
  if (role === "REVIEWER" && ["READY", "IN_PROGRESS"].includes(status)) return "REVIEWER_PROCEDURE";
  return "INSPECT";
}

function stageRank(stage) {
  return ({
    VERIFIED_HANDOFF: 0,
    PARTNER_CLEARANCE: 5,
    LIVE_PREFLIGHT_REQUIRED: 10,
    REVIEWER_PROCEDURE: 15,
    BLOCKED: 30,
    WAITING_ON_CLIENT: 40,
    RETURNED: 50,
    INSPECT: 60,
  })[stage] ?? 99;
}

function nextAction(stage) {
  if (stage === "VERIFIED_HANDOFF") return "Review evidence and decide";
  if (stage === "LIVE_PREFLIGHT_REQUIRED") return "Run live evidence preflight before decision";
  if (stage === "PARTNER_CLEARANCE") return "Complete partner clearance";
  if (stage === "REVIEWER_PROCEDURE") return "Complete reviewer procedure";
  if (stage === "BLOCKED") return "Resolve accounting blocker";
  if (stage === "WAITING_ON_CLIENT") return "Follow client dependency";
  if (stage === "RETURNED") return "Await preparer correction";
  return "Inspect workpaper";
}

function priorityScore(row, viewerId) {
  let score = stageRank(row.stage) * 10;
  if (row.owner_id && viewerId && row.owner_id === viewerId) score -= 45;
  if (row.overdue) score -= 35;
  if (row.client_dependency.overdue > 0) score -= 8;
  if (!row.owner_id) score -= 5;
  return score;
}

function buildCapacity(queue) {
  const byOwner = new Map();
  for (const row of queue) {
    const key = row.owner_id || "UNASSIGNED";
    const current = byOwner.get(key) || {
      staff_account_id: row.owner_id || null,
      name: row.owner_name || (row.owner_id ? "Accounting team member" : "Unassigned"),
      items: 0,
      minutes: 0,
      overdue: 0,
      verified_handoffs: 0,
      live_preflight_required: 0,
      partner_clearance: 0,
      blocked: 0,
      waiting_on_client: 0,
    };
    current.items += 1;
    current.minutes += Math.max(0, Number(row.budget_minutes || 0));
    if (row.overdue) current.overdue += 1;
    if (row.stage === "VERIFIED_HANDOFF") current.verified_handoffs += 1;
    if (row.stage === "LIVE_PREFLIGHT_REQUIRED") current.live_preflight_required += 1;
    if (row.stage === "PARTNER_CLEARANCE") current.partner_clearance += 1;
    if (row.stage === "BLOCKED") current.blocked += 1;
    if (row.stage === "WAITING_ON_CLIENT") current.waiting_on_client += 1;
    byOwner.set(key, current);
  }
  return [...byOwner.values()]
    .map((row) => ({ ...row, hours: hours(row.minutes) }))
    .sort((a, b) => b.overdue - a.overdue || b.verified_handoffs - a.verified_handoffs || b.minutes - a.minutes || a.name.localeCompare(b.name));
}

export function buildFinanceReviewerControlTower({
  engagements = [],
  profiles = [],
  runs = [],
  workItems = [],
  clientRequests = [],
  organizations = [],
  viewer = {},
  generatedAt = new Date().toISOString(),
  sources = {},
} = {}) {
  const today = dateOnly(generatedAt);
  const activeEngagementIds = new Set((engagements || []).map((row) => row.id).filter(Boolean));
  const activeClientIds = new Set((engagements || []).map((row) => row.organization_id).filter(Boolean));
  const activeRuns = (runs || []).filter((run) => activeEngagementIds.has(run.engagement_id) && activeClientIds.has(run.organization_id));
  const activeRunIds = new Set(activeRuns.map((row) => row.id));
  const runMap = mapBy(activeRuns, "id");
  const profileMap = mapBy((profiles || []).filter((row) => activeClientIds.has(row.organization_id)), "organization_id");
  const organizationMap = mapBy((organizations || []).filter((row) => activeClientIds.has(row.id)), "id");
  const requestRows = (clientRequests || []).filter((row) => activeRunIds.has(row.run_id) && OPEN_CLIENT_REQUEST_STATUSES.has(upper(row.status)));
  const requestsByRun = groupBy(requestRows, "run_id");
  const requestsByClient = groupBy(requestRows, "organization_id");
  const reviewItems = (workItems || []).filter((item) => {
    if (!activeRunIds.has(item.run_id)) return false;
    const status = upper(item.status);
    const role = upper(item.required_role);
    return status === "READY_FOR_REVIEW" || status === "CHANGES_REQUESTED" ||
      (REVIEW_ROLES.has(role) && REVIEW_WORK_STATUSES.has(status));
  });

  const queue = reviewItems.map((item) => {
    const run = runMap.get(item.run_id) || {};
    const profile = profileMap.get(item.organization_id) || {};
    const organization = organizationMap.get(item.organization_id) || {};
    const dependencies = requestsByRun.get(item.run_id) || [];
    const stage = queueStage(item);
    const ownerId = assignedOwner(item, profile);
    const ownerName = assignedOwnerName(item, profile);
    const overdue = isOverdue(item.due_at || run.due_at, today);
    const clientDependency = {
      open: dependencies.length,
      overdue: dependencies.filter((row) => isOverdue(row.due_at, today)).length,
      submitted: dependencies.filter((row) => upper(row.status) === "SUBMITTED").length,
      changes_requested: dependencies.filter((row) => upper(row.status) === "CHANGES_REQUESTED").length,
      statuses: [...new Set(dependencies.map((row) => upper(row.status)).filter(Boolean))].sort(),
    };
    const row = {
      id: item.id,
      run_id: item.run_id,
      engagement_id: run.engagement_id || null,
      organization_id: item.organization_id,
      entity_id: item.entity_id || run.entity_id || null,
      period_id: run.period_id || null,
      client_name: organization.name || "Client organization",
      title: item.title || item.step_key || "Review work",
      step_key: item.step_key || null,
      sequence_no: item.sequence_no || 0,
      work_type: item.work_type || null,
      required_role: upper(item.required_role) || null,
      status: upper(item.status),
      stage,
      next_action: nextAction(stage),
      owner_id: ownerId,
      owner_name: ownerName,
      due_at: item.due_at || run.due_at || null,
      overdue,
      blocked_reason: clean(item.blocked_reason) || null,
      capability_id: item.capability_id || null,
      finance_review_item_id: item.finance_review_item_id || null,
      conclusion_present: clean(item.conclusion).length > 0,
      budget_minutes: Math.max(0, Number(item.budget_minutes || 0)),
      handoff_preflight: item.metadata?.review_handoff_preflight || null,
      client_dependency: clientDependency,
      requires_live_signoff_preflight: true,
      run_status: upper(run.status) || null,
      run_due_at: run.due_at || null,
      assigned_accountant_id: profile.assigned_accountant_id || null,
      assigned_accountant: profile.assigned_accountant_name || null,
      assigned_reviewer_id: profile.assigned_reviewer_id || null,
      assigned_reviewer: profile.assigned_reviewer_name || null,
      assigned_partner_id: profile.assigned_partner_id || null,
      assigned_partner: profile.assigned_partner_name || null,
      updated_at: item.updated_at || null,
    };
    row.priority_score = priorityScore(row, viewer.staff_account_id || null);
    return row;
  }).sort((a, b) =>
    a.priority_score - b.priority_score ||
    String(a.due_at || "9999-12-31").localeCompare(String(b.due_at || "9999-12-31")) ||
    a.client_name.localeCompare(b.client_name) ||
    Number(a.sequence_no || 0) - Number(b.sequence_no || 0)
  );

  const clients = new Map();
  for (const clientId of activeClientIds) {
    const profile = profileMap.get(clientId) || {};
    const organization = organizationMap.get(clientId) || {};
    clients.set(clientId, {
      organization_id: clientId,
      name: organization.name || "Client organization",
      assigned_accountant_id: profile.assigned_accountant_id || null,
      assigned_accountant: profile.assigned_accountant_name || null,
      assigned_reviewer_id: profile.assigned_reviewer_id || null,
      assigned_reviewer: profile.assigned_reviewer_name || null,
      assigned_partner_id: profile.assigned_partner_id || null,
      assigned_partner: profile.assigned_partner_name || null,
      queue_items: 0,
      verified_handoffs: 0,
      live_preflight_required: 0,
      partner_clearance: 0,
      blocked: 0,
      waiting_on_client: 0,
      returned: 0,
      overdue: 0,
      unassigned: 0,
      client_requests: (requestsByClient.get(clientId) || []).length,
    });
  }
  for (const row of queue) {
    const client = clients.get(row.organization_id);
    if (!client) continue;
    client.queue_items += 1;
    if (row.stage === "VERIFIED_HANDOFF") client.verified_handoffs += 1;
    if (row.stage === "LIVE_PREFLIGHT_REQUIRED") client.live_preflight_required += 1;
    if (row.stage === "PARTNER_CLEARANCE") client.partner_clearance += 1;
    if (row.stage === "BLOCKED") client.blocked += 1;
    if (row.stage === "WAITING_ON_CLIENT") client.waiting_on_client += 1;
    if (row.stage === "RETURNED") client.returned += 1;
    if (row.overdue) client.overdue += 1;
    if (!row.owner_id) client.unassigned += 1;
  }

  const clientRows = [...clients.values()].sort((a, b) =>
    b.overdue - a.overdue ||
    b.verified_handoffs - a.verified_handoffs ||
    b.live_preflight_required - a.live_preflight_required ||
    b.blocked - a.blocked ||
    a.name.localeCompare(b.name)
  );

  const viewerId = viewer.staff_account_id || null;
  return {
    integrity: {
      complete: Object.values(sources || {}).every((source) => source?.complete !== false),
      queue_truth: "SERVER_GENERATED",
      handoff_truth: "STORED_PREFLIGHT_OR_LIVE_PREFLIGHT_REQUIRED",
      final_authorization: "LIVE_REVIEW_SIGNOFF_PREFLIGHT",
      sources,
    },
    viewer,
    summary: {
      active_clients: activeClientIds.size,
      queue_items: queue.length,
      my_review: viewerId ? queue.filter((row) => row.owner_id === viewerId).length : 0,
      verified_handoffs: queue.filter((row) => row.stage === "VERIFIED_HANDOFF").length,
      live_preflight_required: queue.filter((row) => row.stage === "LIVE_PREFLIGHT_REQUIRED").length,
      partner_clearance: queue.filter((row) => row.stage === "PARTNER_CLEARANCE").length,
      blocked: queue.filter((row) => row.stage === "BLOCKED").length,
      waiting_on_client: queue.filter((row) => row.stage === "WAITING_ON_CLIENT").length,
      returned: queue.filter((row) => row.stage === "RETURNED").length,
      overdue: queue.filter((row) => row.overdue).length,
      unassigned: queue.filter((row) => !row.owner_id).length,
      open_client_requests: requestRows.length,
      overdue_client_requests: requestRows.filter((row) => isOverdue(row.due_at, today)).length,
    },
    queue,
    capacity: buildCapacity(queue),
    clients: clientRows,
    generated_at: generatedAt,
  };
}
