import {
  CreativeVideoStudioOrchestrationRuntime,
} from "@/lib/creative/studio/runtime/CreativeVideoStudioOrchestrationRuntime";
import {
  CreativeEditReviewRuntime,
} from "@/lib/creative/review/runtime/CreativeEditReviewRuntime";

const CONTRACT = "CREATIVE_VIDEO_STUDIO_REVIEW_ORCHESTRATION_V1";

function reviewPhase(edit, review) {
  if (edit?.status !== "COMPLETE") {
    return {
      id: "review",
      label: "Review",
      workspace: "review",
      status: "BLOCKED",
      detail: "Review opens after the governed edit is complete.",
      evidence: {},
    };
  }

  if (!review?.timeline?.id) {
    return {
      id: "review",
      label: "Review",
      workspace: "review",
      status: "READY",
      detail: "The edit is ready to enter the Review Room.",
      evidence: {},
    };
  }

  const evidence = {
    timeline_asset_node_id: review.timeline.id,
    timeline_identity: review.timeline.metadata?.timeline_identity || null,
    version_count: review.versions?.length || 0,
    open_comment_count: review.open_comment_count || 0,
    resolved_comment_count: review.resolved_comment_count || 0,
    edit_approval_record_id: review.edit_approval?.id || null,
  };

  if ((review.open_comment_count || 0) > 0 || (review.missing_requirement_count || 0) > 0) {
    return {
      id: "review",
      label: "Review",
      workspace: "review",
      status: "NEEDS_ATTENTION",
      detail: `${review.open_comment_count || 0} review note${review.open_comment_count === 1 ? "" : "s"} remain unresolved.`,
      evidence,
    };
  }

  if (!review.approved) {
    return {
      id: "review",
      label: "Review",
      workspace: "review",
      status: "WAITING_APPROVAL",
      detail: "The current cut has no unresolved notes and is waiting for authenticated edit approval.",
      evidence,
    };
  }

  return {
    id: "review",
    label: "Review",
    workspace: "review",
    status: "COMPLETE",
    detail: "The current cut is approved and all timecoded review notes are resolved.",
    evidence,
  };
}

function nextAction(phases = [], fallback = null) {
  const production = phases.find((phase) => phase.id === "production");
  const edit = phases.find((phase) => phase.id === "edit");
  const review = phases.find((phase) => phase.id === "review");
  const mastering = phases.find((phase) => phase.id === "mastering");
  const release = phases.find((phase) => phase.id === "release");

  if (production?.status !== "COMPLETE") return fallback;
  if (edit?.status !== "COMPLETE") return fallback;

  if (review?.status !== "COMPLETE") {
    const labels = {
      READY: "Open Review Room",
      NEEDS_ATTENTION: "Resolve review notes",
      WAITING_APPROVAL: "Approve edit cut",
      BLOCKED: "Finish edit first",
    };
    return {
      workspace: "review",
      phase: "review",
      label: labels[review?.status] || "Review edit cut",
      reason: review?.detail || "Edit review is the next governed step.",
    };
  }

  if (mastering?.status !== "COMPLETE") {
    const labels = {
      READY: "Build master",
      WAITING_APPROVAL: "Approve final master",
      NEEDS_ATTENTION: "Resolve mastering blockers",
      IN_PROGRESS: "Run release audit",
    };
    return {
      workspace: "render",
      phase: "mastering",
      label: labels[mastering?.status] || "Review mastering",
      reason: mastering?.detail || "Mastering is the next governed step.",
    };
  }

  if (release?.status !== "COMPLETE") return fallback;
  return fallback;
}

export const CreativeVideoStudioReviewOrchestrationRuntime = Object.freeze({
  contract: CONTRACT,

  async inspect({ organization_id, creative_project_id } = {}) {
    const [base, review] = await Promise.all([
      CreativeVideoStudioOrchestrationRuntime.inspect({
        organization_id,
        creative_project_id,
      }),
      CreativeEditReviewRuntime.inspect({
        organization_id,
        creative_project_id,
      }),
    ]);

    const phases = [...(base.phases || [])];
    const editIndex = phases.findIndex((phase) => phase.id === "edit");
    const edit = phases[editIndex] || null;
    const reviewState = reviewPhase(edit, review);
    phases.splice(editIndex >= 0 ? editIndex + 1 : 2, 0, reviewState);

    const mastering = phases.find((phase) => phase.id === "mastering");
    if (reviewState.status !== "COMPLETE" && mastering) {
      mastering.status = "BLOCKED";
      mastering.detail = "Mastering is locked until the current edit passes governed Review.";
      mastering.evidence = {
        ...(mastering.evidence || {}),
        blocked_by_review: true,
      };
    }

    const completed = phases.filter((phase) => phase.status === "COMPLETE").length;
    const current = phases.find((phase) => phase.status !== "COMPLETE") || phases[phases.length - 1];

    return {
      ...base,
      contract: CONTRACT,
      phases,
      current_phase: current?.id || "release",
      current_phase_label: current?.label || "Release",
      next_action: nextAction(phases, base.next_action),
      progress: {
        completed_count: completed,
        total_count: phases.length,
        percent: Math.round((completed / Math.max(1, phases.length)) * 100),
      },
      evidence: {
        ...(base.evidence || {}),
        edit_review_timeline_asset_node_id: review.timeline?.id || null,
        edit_approval_record_id: review.edit_approval?.id || null,
        open_review_comment_count: review.open_comment_count || 0,
      },
      edit_review: review,
    };
  },
});

export const CREATIVE_VIDEO_STUDIO_REVIEW_ORCHESTRATION_CONTRACT = CONTRACT;
