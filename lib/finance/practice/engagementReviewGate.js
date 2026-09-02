import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const FINAL_STATUSES = new Set(["CLEARED", "LOCKED"]);
const REVIEWED_STATUSES = new Set(["REVIEWED", "CLEARED", "LOCKED"]);
const REVIEW_PHASE_STATUSES = new Set(["READY_FOR_REVIEW", "CHANGES_REQUESTED", "REVIEWED", "CLEARED", "LOCKED"]);

const STAGES = {
  REVIEW_PHASE: {
    key: "REVIEW_PHASE",
    label: "Reviewer review",
    required_roles: ["PREPARER"],
    accepted_statuses: REVIEW_PHASE_STATUSES,
    require_zero_open_notes: false,
  },
  REVIEW_POINT_CLEARANCE: {
    key: "REVIEW_POINT_CLEARANCE",
    label: "Review-point clearance",
    required_roles: ["PREPARER", "REVIEWER"],
    accepted_statuses: REVIEWED_STATUSES,
    require_zero_open_notes: true,
  },
  PARTNER_FINAL_CLEARANCE: {
    key: "PARTNER_FINAL_CLEARANCE",
    label: "Partner final clearance",
    required_roles: ["PREPARER", "REVIEWER", "PARTNER"],
    accepted_statuses: FINAL_STATUSES,
    require_zero_open_notes: true,
  },
};

const STAGE_ORDER = [
  STAGES.REVIEW_PHASE,
  STAGES.REVIEW_POINT_CLEARANCE,
  STAGES.PARTNER_FINAL_CLEARANCE,
];

function clean(value) {
  return String(value ?? "").trim();
}

function stageForWorkItem(item) {
  const stepKey = clean(item?.step_key).toLowerCase();
  const role = clean(item?.required_role).toUpperCase();

  if (role === "PARTNER" || stepKey.includes("partner")) return STAGES.PARTNER_FINAL_CLEARANCE;
  if (stepKey === "clear_review_points") return STAGES.REVIEW_POINT_CLEARANCE;
  if (role === "REVIEWER") return STAGES.REVIEW_PHASE;
  return STAGES.REVIEW_POINT_CLEARANCE;
}

function reviewScope(run) {
  return {
    organization_id: run?.organization_id || null,
    entity_id: run?.entity_id || null,
    period_id: run?.period_id || null,
  };
}

function blocker(code, message, extra = {}) {
  return { code, message, ...extra };
}

function scopeBlockers(scope) {
  const blockers = [];
  if (!scope.organization_id) blockers.push(blocker("REVIEW_ORGANIZATION_SCOPE_REQUIRED", "Client organization scope is required for Finance review clearance"));
  if (!scope.entity_id) blockers.push(blocker("REVIEW_ENTITY_SCOPE_REQUIRED", "Legal entity scope is required for Finance review clearance"));
  if (!scope.period_id) blockers.push(blocker("REVIEW_PERIOD_SCOPE_REQUIRED", "Accounting period scope is required for Finance review clearance"));
  return blockers;
}

async function loadEngagementReviewScope(scope) {
  const blockers = scopeBlockers(scope);
  if (blockers.length) {
    return {
      scope,
      scope_blockers: blockers,
      review_items: [],
      notes_by_review: new Map(),
      signoffs_by_review: new Map(),
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
    return {
      scope,
      scope_blockers: [],
      review_items: [],
      notes_by_review: new Map(),
      signoffs_by_review: new Map(),
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

  return {
    scope,
    scope_blockers: [],
    review_items: items,
    notes_by_review: notesByReview,
    signoffs_by_review: signoffsByReview,
  };
}

function evaluateLoadedStage(loaded, stage) {
  const blockers = [...loaded.scope_blockers];
  const items = loaded.review_items || [];

  if (!blockers.length && !items.length) {
    blockers.push(blocker(
      "REVIEW_SCOPE_EMPTY",
      "No Finance review records exist for this client, legal entity and accounting period"
    ));
  }

  let unresolvedNoteCount = 0;
  const evaluatedItems = items.map((reviewItem) => {
    const notes = loaded.notes_by_review.get(reviewItem.id) || [];
    const openNotes = notes.filter((note) => note.status !== "RESOLVED");
    const signoffs = loaded.signoffs_by_review.get(reviewItem.id) || [];
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
        { review_item_id: reviewItem.id, record_label: reviewItem.record_label || null, status: reviewItem.status }
      ));
    }
    if (missingRoles.length) {
      itemBlockers.push("SIGNOFFS_MISSING");
      blockers.push(blocker(
        "REVIEW_SIGNOFFS_MISSING",
        `${reviewItem.record_label || reviewItem.record_key || "Finance record"} is missing ${missingRoles.join(", ")} sign-off`,
        { review_item_id: reviewItem.id, record_label: reviewItem.record_label || null, missing_roles: missingRoles }
      ));
    }
    if (stage.require_zero_open_notes && openNotes.length) {
      itemBlockers.push("OPEN_REVIEW_POINTS");
      blockers.push(blocker(
        "REVIEW_POINTS_OPEN",
        `${reviewItem.record_label || reviewItem.record_key || "Finance record"} has ${openNotes.length} unresolved review point${openNotes.length === 1 ? "" : "s"}`,
        { review_item_id: reviewItem.id, record_label: reviewItem.record_label || null, open_review_points: openNotes.length }
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
    stage_label: stage.label,
    scope: loaded.scope,
    required_roles: stage.required_roles,
    review_item_count: evaluatedItems.length,
    review_item_ids: evaluatedItems.map((row) => row.id),
    satisfied_review_items: evaluatedItems.filter((row) => row.satisfied).length,
    unresolved_note_count: unresolvedNoteCount,
    status_counts: statusCounts,
    signoff_counts: signoffCounts,
    blockers: blockers.slice(0, 100),
    review_items: evaluatedItems,
    evaluated_at: new Date().toISOString(),
  };
}

export async function evaluateEngagementReviewGate({ run, workItem }) {
  if (workItem?.work_type !== "FINANCE_REVIEW") {
    return { applicable: false, satisfied: true, stage: null, blockers: [] };
  }

  const loaded = await loadEngagementReviewScope(reviewScope(run));
  return evaluateLoadedStage(loaded, stageForWorkItem(workItem));
}

export async function evaluateEngagementReviewPortfolio({ run }) {
  if (!run) {
    return {
      applicable: false,
      satisfied: false,
      fully_cleared: false,
      current_stage: null,
      scope: null,
      review_item_count: 0,
      reviewed_record_count: 0,
      cleared_record_count: 0,
      unresolved_note_count: 0,
      signoff_counts: { PREPARER: 0, REVIEWER: 0, PARTNER: 0 },
      stages: [],
      blockers: [],
      evaluated_at: new Date().toISOString(),
    };
  }

  const loaded = await loadEngagementReviewScope(reviewScope(run));
  const stages = STAGE_ORDER.map((stage) => evaluateLoadedStage(loaded, stage));
  const finalStage = stages[stages.length - 1];
  const currentStage = stages.find((stage) => !stage.satisfied) || null;
  const baseItems = finalStage.review_items || [];

  return {
    applicable: true,
    satisfied: finalStage.satisfied,
    fully_cleared: finalStage.satisfied,
    current_stage: currentStage?.stage || "COMPLETE",
    current_stage_label: currentStage?.stage_label || "Review fully cleared",
    scope: finalStage.scope,
    review_item_count: finalStage.review_item_count,
    reviewed_record_count: baseItems.filter((item) => REVIEWED_STATUSES.has(item.status)).length,
    cleared_record_count: baseItems.filter((item) => FINAL_STATUSES.has(item.status)).length,
    unresolved_note_count: finalStage.unresolved_note_count,
    signoff_counts: finalStage.signoff_counts,
    status_counts: finalStage.status_counts,
    stages: stages.map((stage) => ({
      stage: stage.stage,
      label: stage.stage_label,
      satisfied: stage.satisfied,
      required_roles: stage.required_roles,
      satisfied_review_items: stage.satisfied_review_items,
      review_item_count: stage.review_item_count,
      unresolved_note_count: stage.unresolved_note_count,
      blockers: stage.blockers,
    })),
    blockers: currentStage?.blockers || [],
    review_items: finalStage.review_items,
    evaluated_at: finalStage.evaluated_at,
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
