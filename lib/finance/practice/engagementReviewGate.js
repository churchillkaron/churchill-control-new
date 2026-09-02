import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const FINAL_STATUSES = new Set(["CLEARED", "LOCKED"]);
const REVIEWED_STATUSES = new Set(["REVIEWED", "CLEARED", "LOCKED"]);
const REVIEW_PHASE_STATUSES = new Set(["READY_FOR_REVIEW", "REVIEWED", "CLEARED", "LOCKED"]);

function clean(value) {
  return String(value ?? "").trim();
}

function stageForWorkItem(item) {
  const stepKey = clean(item?.step_key).toLowerCase();
  const role = clean(item?.required_role).toUpperCase();

  if (role === "PARTNER" || stepKey.includes("partner")) {
    return {
      key: "PARTNER_FINAL_CLEARANCE",
      required_roles: ["PREPARER", "REVIEWER", "PARTNER"],
      accepted_statuses: FINAL_STATUSES,
      require_zero_open_notes: true,
    };
  }

  if (stepKey === "clear_review_points") {
    return {
      key: "REVIEW_POINT_CLEARANCE",
      required_roles: ["PREPARER", "REVIEWER"],
      accepted_statuses: REVIEWED_STATUSES,
      require_zero_open_notes: true,
    };
  }

  if (role === "REVIEWER") {
    return {
      key: "REVIEW_PHASE",
      required_roles: ["PREPARER"],
      accepted_statuses: REVIEW_PHASE_STATUSES,
      require_zero_open_notes: false,
    };
  }

  return {
    key: "REVIEW_POINT_CLEARANCE",
    required_roles: ["PREPARER", "REVIEWER"],
    accepted_statuses: REVIEWED_STATUSES,
    require_zero_open_notes: true,
  };
}

function blocker(code, message, extra = {}) {
  return { code, message, ...extra };
}

export async function evaluateEngagementReviewGate({ run, workItem }) {
  if (workItem?.work_type !== "FINANCE_REVIEW") {
    return { applicable: false, satisfied: true, stage: null, blockers: [] };
  }

  const stage = stageForWorkItem(workItem);
  const scope = {
    organization_id: run?.organization_id || null,
    entity_id: run?.entity_id || null,
    period_id: run?.period_id || null,
  };
  const blockers = [];

  if (!scope.organization_id) blockers.push(blocker("REVIEW_ORGANIZATION_SCOPE_REQUIRED", "Client organization scope is required for Finance review clearance"));
  if (!scope.entity_id) blockers.push(blocker("REVIEW_ENTITY_SCOPE_REQUIRED", "Legal entity scope is required for Finance review clearance"));
  if (!scope.period_id) blockers.push(blocker("REVIEW_PERIOD_SCOPE_REQUIRED", "Accounting period scope is required for Finance review clearance"));

  if (blockers.length) {
    return {
      applicable: true,
      satisfied: false,
      stage: stage.key,
      scope,
      required_roles: stage.required_roles,
      review_item_count: 0,
      unresolved_note_count: 0,
      blockers,
      review_items: [],
      evaluated_at: new Date().toISOString(),
    };
  }

  const { data: reviewItems, error: reviewError } = await supabaseAdmin
    .from("finance_review_items")
    .select("id,capability_id,record_key,record_type,record_label,status,priority,updated_at")
    .eq("organization_id", scope.organization_id)
    .eq("entity_id", scope.entity_id)
    .eq("period_id", scope.period_id)
    .order("updated_at", { ascending: false })
    .limit(2000);
  if (reviewError) throw reviewError;

  const items = reviewItems || [];
  if (!items.length) {
    blockers.push(blocker(
      "REVIEW_SCOPE_EMPTY",
      "No Finance review records exist for this client, legal entity and accounting period"
    ));
    return {
      applicable: true,
      satisfied: false,
      stage: stage.key,
      scope,
      required_roles: stage.required_roles,
      review_item_count: 0,
      unresolved_note_count: 0,
      blockers,
      review_items: [],
      evaluated_at: new Date().toISOString(),
    };
  }

  const reviewIds = items.map((row) => row.id);
  const [notesResult, signoffsResult] = await Promise.all([
    supabaseAdmin
      .from("finance_review_notes")
      .select("id,review_item_id,status,note_type")
      .eq("organization_id", scope.organization_id)
      .in("review_item_id", reviewIds),
    supabaseAdmin
      .from("finance_review_signoffs")
      .select("id,review_item_id,signoff_role,signed_by,signed_at,cycle_no")
      .eq("organization_id", scope.organization_id)
      .in("review_item_id", reviewIds)
      .is("revoked_at", null),
  ]);
  if (notesResult.error) throw notesResult.error;
  if (signoffsResult.error) throw signoffsResult.error;

  const notesByReview = new Map();
  for (const note of notesResult.data || []) {
    if (!notesByReview.has(note.review_item_id)) notesByReview.set(note.review_item_id, []);
    notesByReview.get(note.review_item_id).push(note);
  }
  const signoffsByReview = new Map();
  for (const signoff of signoffsResult.data || []) {
    if (!signoffsByReview.has(signoff.review_item_id)) signoffsByReview.set(signoff.review_item_id, []);
    signoffsByReview.get(signoff.review_item_id).push(signoff);
  }

  let unresolvedNoteCount = 0;
  const evaluatedItems = items.map((reviewItem) => {
    const notes = notesByReview.get(reviewItem.id) || [];
    const openNotes = notes.filter((note) => note.status !== "RESOLVED");
    const signoffs = signoffsByReview.get(reviewItem.id) || [];
    const activeRoles = new Set(signoffs.map((row) => row.signoff_role));
    const missingRoles = stage.required_roles.filter((role) => !activeRoles.has(role));
    const statusSatisfied = stage.accepted_statuses.has(reviewItem.status);
    unresolvedNoteCount += openNotes.length;

    const itemBlockers = [];
    if (!statusSatisfied) {
      itemBlockers.push("STATUS_NOT_READY");
      blockers.push(blocker(
        "REVIEW_STATUS_NOT_READY",
        `${reviewItem.record_label || reviewItem.record_key || "Finance record"} is ${reviewItem.status}`,
        { review_item_id: reviewItem.id, status: reviewItem.status }
      ));
    }
    if (missingRoles.length) {
      itemBlockers.push("SIGNOFFS_MISSING");
      blockers.push(blocker(
        "REVIEW_SIGNOFFS_MISSING",
        `${reviewItem.record_label || reviewItem.record_key || "Finance record"} is missing ${missingRoles.join(", ")} sign-off`,
        { review_item_id: reviewItem.id, missing_roles: missingRoles }
      ));
    }
    if (stage.require_zero_open_notes && openNotes.length) {
      itemBlockers.push("OPEN_REVIEW_POINTS");
      blockers.push(blocker(
        "REVIEW_POINTS_OPEN",
        `${reviewItem.record_label || reviewItem.record_key || "Finance record"} has ${openNotes.length} unresolved review point${openNotes.length === 1 ? "" : "s"}`,
        { review_item_id: reviewItem.id, open_review_points: openNotes.length }
      ));
    }

    return {
      id: reviewItem.id,
      capability_id: reviewItem.capability_id,
      record_key: reviewItem.record_key,
      record_label: reviewItem.record_label || null,
      status: reviewItem.status,
      open_review_points: openNotes.length,
      active_signoff_roles: [...activeRoles].sort(),
      missing_signoff_roles: missingRoles,
      satisfied: itemBlockers.length === 0,
      blockers: itemBlockers,
    };
  });

  const statusCounts = {};
  const signoffCounts = { PREPARER: 0, REVIEWER: 0, PARTNER: 0 };
  for (const reviewItem of evaluatedItems) {
    statusCounts[reviewItem.status] = (statusCounts[reviewItem.status] || 0) + 1;
    for (const role of reviewItem.active_signoff_roles) {
      if (Object.hasOwn(signoffCounts, role)) signoffCounts[role] += 1;
    }
  }

  return {
    applicable: true,
    satisfied: blockers.length === 0,
    stage: stage.key,
    scope,
    required_roles: stage.required_roles,
    review_item_count: evaluatedItems.length,
    review_item_ids: evaluatedItems.map((row) => row.id),
    unresolved_note_count: unresolvedNoteCount,
    status_counts: statusCounts,
    signoff_counts: signoffCounts,
    blockers: blockers.slice(0, 100),
    review_items: evaluatedItems,
    evaluated_at: new Date().toISOString(),
  };
}

export async function requireEngagementReviewGate({ run, workItem }) {
  const result = await evaluateEngagementReviewGate({ run, workItem });
  if (!result.applicable || result.satisfied) return result;

  const error = new Error(
    result.stage === "PARTNER_FINAL_CLEARANCE"
      ? "Engagement review is not fully cleared for partner sign-off"
      : result.stage === "REVIEW_POINT_CLEARANCE"
        ? "Engagement review points and reviewer sign-offs are not fully cleared"
        : "Engagement is not ready to complete the review phase"
  );
  error.status = 409;
  error.details = result;
  throw error;
}
