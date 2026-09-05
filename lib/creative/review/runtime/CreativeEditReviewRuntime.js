import crypto from "node:crypto";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  ShotRuntime,
} from "@/lib/creative/shots/runtime/ShotRuntime";
import {
  CreativeTemporalAnalysisRuntime,
} from "@/lib/creative/media/runtime/CreativeTemporalAnalysisRuntime";
import {
  CreativeMomentIntelligenceRuntime,
} from "@/lib/creative/media/runtime/CreativeMomentIntelligenceRuntime";
import {
  CreativeTimelineRuntime,
} from "@/lib/creative/timeline/runtime/CreativeTimelineRuntime";

const CONTRACT = "CREATIVE_EDIT_REVIEW_V1";
const REVIEW_COMMENT_TYPE = "REVIEW_COMMENT";
const EDIT_APPROVAL_SCOPE = "EDIT_CUT";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function timestamp(value) {
  return Date.parse(value || 0) || 0;
}

function newest(items = [], predicate = () => true) {
  return [...items]
    .filter(predicate)
    .sort((left, right) =>
      timestamp(right.updated_at || right.created_at) -
      timestamp(left.updated_at || left.created_at),
    )[0] || null;
}

function timelineIdentity(timeline = {}) {
  return text(timeline.metadata?.timeline_identity) || null;
}

function timelineEntries(timeline = {}) {
  return list(timeline.metadata?.edit_decision_list);
}

function timelineComments(nodes = [], timeline = {}) {
  const identity = timelineIdentity(timeline);
  return nodes
    .filter((node) =>
      node.type === REVIEW_COMMENT_TYPE &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED &&
      node.parent_asset_node_id === timeline.id &&
      text(node.metadata?.timeline_asset_node_id) === text(timeline.id) &&
      (!identity || text(node.metadata?.timeline_identity) === identity),
    )
    .sort((left, right) => {
      const timeDelta = finite(left.metadata?.timecode_seconds, 0) -
        finite(right.metadata?.timecode_seconds, 0);
      if (timeDelta !== 0) return timeDelta;
      return timestamp(left.created_at) - timestamp(right.created_at);
    });
}

function commentResolved(comment = {}) {
  return Boolean(
    comment.status === CREATIVE_ASSET_NODE_STATUS.APPROVED ||
    comment.metadata?.resolved_at,
  );
}

function latestFeedbackAt(comments = []) {
  return comments.reduce(
    (latest, comment) => Math.max(
      latest,
      timestamp(comment.updated_at || comment.created_at),
    ),
    0,
  );
}

function currentEditApproval(nodes = [], timeline = {}, comments = []) {
  if (!timeline?.id) return null;
  const identity = timelineIdentity(timeline);
  const feedbackAt = latestFeedbackAt(comments);
  const approval = newest(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.APPROVAL_RECORD &&
    node.status === CREATIVE_ASSET_NODE_STATUS.APPROVED &&
    node.parent_asset_node_id === timeline.id &&
    node.metadata?.subject_asset_node_id === timeline.id &&
    node.metadata?.subject_updated_at === (timeline.updated_at || null) &&
    node.metadata?.subject_identity === identity &&
    node.metadata?.scope === EDIT_APPROVAL_SCOPE &&
    node.metadata?.approver_user_id &&
    node.metadata?.approver_staff_account_id,
  );
  if (!approval) return null;
  return timestamp(approval.metadata?.approved_at || approval.created_at) >= feedbackAt
    ? approval
    : null;
}

function keyForEdit(entry = {}, index = 0) {
  return text(
    entry.source_moment_node_id ||
    entry.source_clip_node_id ||
    entry.source_asset_node_id ||
    `index:${index}`,
  );
}

function compareTimelines(current, previous) {
  if (!current || !previous) return null;
  const currentEntries = timelineEntries(current);
  const previousEntries = timelineEntries(previous);
  const currentMap = new Map(
    currentEntries.map((entry, index) => [keyForEdit(entry, index), { entry, index }]),
  );
  const previousMap = new Map(
    previousEntries.map((entry, index) => [keyForEdit(entry, index), { entry, index }]),
  );
  const added = [...currentMap.keys()].filter((key) => !previousMap.has(key));
  const removed = [...previousMap.keys()].filter((key) => !currentMap.has(key));
  const moved = [...currentMap.entries()]
    .filter(([key, value]) =>
      previousMap.has(key) && previousMap.get(key).index !== value.index,
    )
    .map(([key]) => key);
  const currentDuration = finite(
    current.metadata?.total_duration_seconds ?? current.technical?.duration_seconds,
    0,
  );
  const previousDuration = finite(
    previous.metadata?.total_duration_seconds ?? previous.technical?.duration_seconds,
    0,
  );

  return {
    current_timeline_asset_node_id: current.id,
    previous_timeline_asset_node_id: previous.id,
    added_count: added.length,
    removed_count: removed.length,
    moved_count: moved.length,
    added_keys: added,
    removed_keys: removed,
    moved_keys: moved,
    duration_delta_seconds: currentDuration - previousDuration,
  };
}

function normalizeActor(actor = {}) {
  const userId = actor.user_id || actor.userId || null;
  const staffId = actor.staff_account_id || actor.staffAccountId || null;
  if (!userId || !staffId) throw new Error("AUTHENTICATED_REVIEWER_REQUIRED");
  return {
    user_id: userId,
    staff_account_id: staffId,
    email: actor.email || null,
  };
}

function requirementFromShot(shot = {}) {
  return {
    shot_id: shot.id,
    scene_id: shot.scene_id || null,
    subject: shot.subject || shot.description || shot.purpose || "",
    action: shot.action || shot.intent?.action || "",
    purpose: shot.purpose || shot.intent?.purpose || "",
    emotion: shot.emotion || shot.intent?.emotion || "",
    mood: shot.mood || shot.intent?.mood || "",
    location: shot.location || shot.intent?.location || "",
    actors: list(shot.actors || shot.intent?.actors),
    products: list(shot.products || shot.intent?.products),
    dialogue: shot.dialogue || "",
    narration: shot.narration || "",
    brand_rules: shot.brand_rules || shot.intent?.brand_rules || {},
    tags: list(shot.tags || shot.metadata?.tags),
    transition_in: shot.transition_in || null,
    transition_out: shot.transition_out || null,
  };
}

function requirementFromTask(task = {}) {
  const intent = task.input?.intent || {};
  const requirements = task.input?.requirements || {};
  return {
    task_id: task.id,
    scene_id: task.scene_id || null,
    shot_id: task.shot_id || null,
    subject: requirements.subject || intent.subject || task.title || "",
    action: requirements.action || intent.action || "",
    purpose: requirements.purpose || intent.purpose || task.description || "",
    emotion: requirements.emotion || intent.emotion || "",
    mood: requirements.mood || intent.mood || "",
    location: requirements.location || intent.location || "",
    actors: list(requirements.actors || intent.actors),
    products: list(requirements.products || intent.products),
    dialogue: requirements.dialogue || intent.dialogue || "",
    narration: requirements.narration || intent.narration || "",
    brand_rules: requirements.brand_rules || intent.brand_rules || {},
    tags: list(requirements.tags || intent.tags),
  };
}

function editPolicy(project = {}) {
  const configured = project.metadata?.post_production || {};
  return {
    temporal: {
      threshold: finite(
        configured.temporal_analysis?.threshold ??
        configured.temporalAnalysis?.threshold,
        0.3,
      ),
      minimum_scene_seconds: finite(
        configured.temporal_analysis?.minimum_scene_seconds ??
        configured.temporalAnalysis?.minimumSceneSeconds,
        0.75,
      ),
      ...(configured.temporal_analysis || configured.temporalAnalysis || {}),
    },
    moment: {
      weights: {
        semantic: 4,
        quality: 2,
        brand: 2,
        cut_strength: 1,
        transcript_evidence: 1,
        ...(configured.moment_intelligence?.weights ||
          configured.momentIntelligence?.weights || {}),
      },
      ...(configured.moment_intelligence || configured.momentIntelligence || {}),
    },
    timeline: {
      minimum_score: finite(
        configured.timeline?.minimum_score ?? configured.timeline?.minimumScore,
        0,
      ),
      maximum_duration_seconds: finite(
        configured.timeline?.maximum_duration_seconds ??
        configured.timeline?.maximumDurationSeconds ??
        project.target_duration,
        null,
      ),
      allow_fallback: configured.timeline?.allow_fallback !== false,
      ...(configured.timeline || {}),
    },
  };
}

function eligibleSourceVideo(node = {}) {
  return Boolean(
    node.type === CREATIVE_ASSET_NODE_TYPES.VIDEO &&
    node.status !== CREATIVE_ASSET_NODE_STATUS.REJECTED &&
    node.metadata?.blocked !== true &&
    node.metadata?.include_in_master !== false &&
    node.metadata?.virtual_clip !== true &&
    node.lineage?.source !== "scene_detection",
  );
}

async function resolveRequirements({ organization_id, creative_project_id, tasks }) {
  const shots = await ShotRuntime.list({ organization_id, creative_project_id });
  if (shots.length) return shots.map(requirementFromShot);
  return tasks
    .filter((task) => task.type === "GENERATE_VIDEO")
    .map(requirementFromTask);
}

async function ensureTimeline({ organization_id, creative_project_id }) {
  const [project, tasks, initialNodes] = await Promise.all([
    CreativeProjectRepository.getById(creative_project_id),
    ProductionTaskRuntime.list({ organization_id, creative_project_id }),
    AssetGraphRepository.listByProject({ organization_id, creative_project_id }),
  ]);
  if (!project || text(project.organization_id) !== text(organization_id)) {
    throw new Error("Creative project not found");
  }

  const failed = tasks.filter((task) =>
    ["FAILED", "SKIPPED"].includes(text(task.status).toUpperCase()),
  );
  const incomplete = tasks.filter((task) => text(task.status).toUpperCase() !== "COMPLETED");
  if (failed.length) {
    return {
      status: "BLOCKED_BY_PRODUCTION_FAILURE",
      timeline: null,
      failed_task_ids: failed.map((task) => task.id),
    };
  }
  if (!tasks.length || incomplete.length) {
    return {
      status: "AWAITING_PRODUCTION",
      timeline: null,
      incomplete_task_ids: incomplete.map((task) => task.id),
    };
  }

  const existingTimeline = newest(initialNodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.TIMELINE &&
    node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED &&
    timelineEntries(node).length > 0,
  );
  if (existingTimeline) {
    return { status: "READY", timeline: existingTimeline, reused: true };
  }

  const requirements = await resolveRequirements({
    organization_id,
    creative_project_id,
    tasks,
  });
  const policy = editPolicy(project);
  const videos = initialNodes.filter(eligibleSourceVideo);
  if (!videos.length) {
    return { status: "AWAITING_VIDEO_ASSETS", timeline: null };
  }

  const moments = [];
  for (const video of videos) {
    await CreativeTemporalAnalysisRuntime.analyze({
      organization_id,
      parent_asset_node_id: video.id,
      options: policy.temporal,
      policy: {},
    });
    const intelligence = await CreativeMomentIntelligenceRuntime.analyze({
      organization_id,
      parent_asset_node_id: video.id,
      requirements,
      policy: policy.moment,
    });
    moments.push(...list(intelligence.moments));
  }
  if (!moments.length) {
    return { status: "AWAITING_SEMANTIC_MOMENTS", timeline: null };
  }

  const composed = await CreativeTimelineRuntime.compose({
    organization_id,
    creative_project_id,
    requirements,
    options: policy.timeline,
  });
  return {
    status: "READY",
    timeline: composed.timeline,
    reused: composed.reused === true,
  };
}

async function inspection({ organization_id, creative_project_id }) {
  const [project, nodes] = await Promise.all([
    CreativeProjectRepository.getById(creative_project_id),
    AssetGraphRepository.listByProject({ organization_id, creative_project_id }),
  ]);
  if (!project || text(project.organization_id) !== text(organization_id)) {
    throw new Error("Creative project not found");
  }

  const versions = nodes
    .filter((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.TIMELINE &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    )
    .sort((left, right) =>
      timestamp(right.updated_at || right.created_at) -
      timestamp(left.updated_at || left.created_at),
    );
  const timeline = versions[0] || null;
  const comments = timeline ? timelineComments(nodes, timeline) : [];
  const openComments = comments.filter((comment) => !commentResolved(comment));
  const approval = timeline ? currentEditApproval(nodes, timeline, comments) : null;
  const missingRequirements = list(timeline?.metadata?.missing_requirements);
  const entries = timelineEntries(timeline);
  const comparison = compareTimelines(versions[0], versions[1]);

  return {
    contract: CONTRACT,
    inspected_at: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name || project.title || "Creative project",
    },
    timeline,
    versions: versions.map((version) => ({
      id: version.id,
      name: version.name || "Creative timeline",
      status: version.status,
      timeline_identity: timelineIdentity(version),
      clip_count: timelineEntries(version).length,
      duration_seconds: finite(
        version.metadata?.total_duration_seconds ?? version.technical?.duration_seconds,
        0,
      ),
      updated_at: version.updated_at || version.created_at || null,
    })),
    comparison,
    comments,
    open_comment_count: openComments.length,
    resolved_comment_count: comments.length - openComments.length,
    edit_approval: approval,
    approved: Boolean(approval),
    can_approve: Boolean(
      timeline &&
      entries.length &&
      !missingRequirements.length &&
      !openComments.length,
    ),
    missing_requirement_count: missingRequirements.length,
    ready_for_master: Boolean(
      timeline &&
      entries.length &&
      !missingRequirements.length &&
      !openComments.length &&
      approval,
    ),
  };
}

export const CreativeEditReviewRuntime = Object.freeze({
  contract: CONTRACT,

  async prepare({ organization_id, creative_project_id } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    const preparation = await ensureTimeline({ organization_id, creative_project_id });
    return {
      preparation,
      review: await inspection({ organization_id, creative_project_id }),
    };
  },

  async inspect({ organization_id, creative_project_id } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    return inspection({ organization_id, creative_project_id });
  },

  async gate({ organization_id, creative_project_id } = {}) {
    const prepared = await this.prepare({ organization_id, creative_project_id });
    const ready = prepared.preparation.status === "READY" &&
      prepared.review.ready_for_master === true;
    return {
      ...prepared.review,
      preparation_status: prepared.preparation.status,
      ready,
      status: ready ? "APPROVED_FOR_MASTER" : "AWAITING_EDIT_REVIEW",
    };
  },

  async comment({
    organization_id,
    creative_project_id,
    timeline_asset_node_id,
    body,
    timecode_seconds = 0,
    annotation = null,
    actor,
  } = {}) {
    const reviewer = normalizeActor(actor);
    const review = await inspection({ organization_id, creative_project_id });
    const timeline = review.timeline;
    if (!timeline || text(timeline.id) !== text(timeline_asset_node_id)) {
      throw new Error("CURRENT_TIMELINE_REQUIRED");
    }
    const note = text(body);
    if (!note) throw new Error("REVIEW_COMMENT_BODY_REQUIRED");
    const timecode = finite(timecode_seconds, 0);
    const duration = finite(
      timeline.metadata?.total_duration_seconds ?? timeline.technical?.duration_seconds,
      0,
    );
    if (timecode < 0 || (duration > 0 && timecode > duration + 0.001)) {
      throw new Error("REVIEW_TIMECODE_OUT_OF_RANGE");
    }

    const node = createCreativeAssetNode({
      organization_id,
      creative_project_id,
      parent_asset_node_id: timeline.id,
      type: REVIEW_COMMENT_TYPE,
      status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
      name: `Edit review note @ ${timecode.toFixed(2)}s`,
      description: note,
      lineage: {
        source: "video_studio_review",
        capability: "creative.review.comment",
        generation_version: 1,
      },
      review: {
        ai_reviewed: false,
        human_reviewed: true,
        approved: false,
        approved_by: null,
        notes: note,
      },
      metadata: {
        timeline_asset_node_id: timeline.id,
        timeline_identity: timelineIdentity(timeline),
        timecode_seconds: timecode,
        annotation: annotation && typeof annotation === "object" ? annotation : null,
        body: note,
        author_user_id: reviewer.user_id,
        author_staff_account_id: reviewer.staff_account_id,
        author_email: reviewer.email,
        created_at: new Date().toISOString(),
      },
      created_by: reviewer.user_id,
    });
    const comment = await AssetGraphRepository.create(node);
    return {
      comment,
      review: await inspection({ organization_id, creative_project_id }),
    };
  },

  async resolve({
    organization_id,
    creative_project_id,
    comment_asset_node_id,
    actor,
  } = {}) {
    const reviewer = normalizeActor(actor);
    const comment = await AssetGraphRepository.getById(comment_asset_node_id);
    if (
      !comment ||
      comment.type !== REVIEW_COMMENT_TYPE ||
      text(comment.organization_id) !== text(organization_id) ||
      text(comment.creative_project_id) !== text(creative_project_id)
    ) {
      throw new Error("REVIEW_COMMENT_NOT_FOUND");
    }
    const resolvedAt = new Date().toISOString();
    const resolved = await AssetGraphRepository.update(comment.id, {
      status: CREATIVE_ASSET_NODE_STATUS.APPROVED,
      review: {
        ...(comment.review || {}),
        human_reviewed: true,
        approved: true,
        approved_by: reviewer.staff_account_id,
      },
      metadata: {
        ...(comment.metadata || {}),
        resolved_at: resolvedAt,
        resolved_by_user_id: reviewer.user_id,
        resolved_by_staff_account_id: reviewer.staff_account_id,
        resolved_by_email: reviewer.email,
      },
    });
    return {
      comment: resolved,
      review: await inspection({ organization_id, creative_project_id }),
    };
  },

  async approve({
    organization_id,
    creative_project_id,
    timeline_asset_node_id,
    notes = "",
    actor,
  } = {}) {
    const approver = normalizeActor(actor);
    const review = await inspection({ organization_id, creative_project_id });
    const timeline = review.timeline;
    if (!timeline || text(timeline.id) !== text(timeline_asset_node_id)) {
      throw new Error("CURRENT_TIMELINE_REQUIRED");
    }
    if (!review.can_approve) throw new Error("EDIT_REVIEW_BLOCKERS_REMAIN");

    const identity = crypto.createHash("sha256").update(JSON.stringify({
      subject_asset_node_id: timeline.id,
      subject_updated_at: timeline.updated_at || null,
      subject_identity: timelineIdentity(timeline),
      latest_feedback_at: latestFeedbackAt(review.comments),
      scope: EDIT_APPROVAL_SCOPE,
      approver_user_id: approver.user_id,
      approver_staff_account_id: approver.staff_account_id,
    })).digest("hex");
    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id,
    });
    const existing = nodes.find((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.APPROVAL_RECORD &&
      node.metadata?.approval_identity === identity,
    );
    if (existing) {
      return {
        approval: existing,
        reused: true,
        review: await inspection({ organization_id, creative_project_id }),
      };
    }

    const approvedAt = new Date().toISOString();
    const approval = createCreativeAssetNode({
      organization_id,
      creative_project_id,
      parent_asset_node_id: timeline.id,
      type: CREATIVE_ASSET_NODE_TYPES.APPROVAL_RECORD,
      status: CREATIVE_ASSET_NODE_STATUS.APPROVED,
      name: `${timeline.name || "Edit cut"} approval`,
      description: "Authenticated edit-cut approval after timecoded review resolution.",
      lineage: {
        source: "authenticated_staff_approval",
        capability: "creative.review.approve",
        generation_version: 1,
      },
      review: {
        ai_reviewed: false,
        human_reviewed: true,
        approved: true,
        approved_by: approver.staff_account_id,
        notes: text(notes),
      },
      metadata: {
        approval_identity: identity,
        subject_asset_node_id: timeline.id,
        subject_type: CREATIVE_ASSET_NODE_TYPES.TIMELINE,
        subject_updated_at: timeline.updated_at || null,
        subject_identity: timelineIdentity(timeline),
        scope: EDIT_APPROVAL_SCOPE,
        latest_feedback_at: latestFeedbackAt(review.comments) || null,
        approver_user_id: approver.user_id,
        approver_staff_account_id: approver.staff_account_id,
        approver_email: approver.email,
        approved_at: approvedAt,
      },
      created_by: approver.user_id,
    });
    const stored = await AssetGraphRepository.create(approval);
    return {
      approval: stored,
      reused: false,
      review: await inspection({ organization_id, creative_project_id }),
    };
  },
});

export const CREATIVE_EDIT_REVIEW_CONTRACT = CONTRACT;
export const CREATIVE_EDIT_REVIEW_COMMENT_TYPE = REVIEW_COMMENT_TYPE;
export const CREATIVE_EDIT_APPROVAL_SCOPE = EDIT_APPROVAL_SCOPE;
