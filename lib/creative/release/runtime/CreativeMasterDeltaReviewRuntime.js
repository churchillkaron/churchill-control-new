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
  creativePrimaryMasters,
  newestCreativeNode,
} from "@/lib/creative/release/runtime/CreativeMasterVersionRuntime";

const CONTRACT = "CREATIVE_MASTER_DELTA_REVIEW_V1";
const DECISION_TYPE = "MASTER_CHANGE_DECISION";
const RESOLUTION_TYPE = "MASTER_REVISION_RESOLUTION";
const CLASSIFICATIONS = new Set(["EXPECTED", "UNEXPECTED"]);
const RESOLUTION_STATES = new Set(["NONE", "OPEN", "RESOLVED"]);

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

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
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

function comparisonReportFor(nodes, leftId, rightId) {
  return newestCreativeNode(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
    node.lineage?.source === "master_version_comparison" &&
    node.metadata?.analysis_complete === true &&
    node.metadata?.left_master_asset_node_id === leftId &&
    node.metadata?.right_master_asset_node_id === rightId,
  );
}

function unitKey(comparisonIdentity, payload) {
  return digest({ comparison_identity: comparisonIdentity, ...payload });
}

function reviewUnits(report = {}) {
  const comparisonIdentity = report.metadata?.master_comparison_identity || null;
  const visual = report.metadata?.visual || {};
  const audio = report.metadata?.audio || null;
  const units = [];

  for (const [index, interval] of list(visual.changed_intervals).entries()) {
    const payload = {
      kind: "VISUAL_INTERVAL",
      index,
      start_frame: finite(interval.start_frame, 0),
      end_frame: finite(interval.end_frame, 0),
      start_seconds: finite(interval.start_seconds, 0),
      end_seconds: finite(interval.end_seconds, 0),
      minimum_ssim: finite(interval.minimum_ssim),
    };
    units.push({
      key: unitKey(comparisonIdentity, payload),
      ...payload,
      title: `Visual change ${index + 1}`,
      description: "Decoded-frame difference interval detected between the previous and current primary masters.",
    });
  }

  if (audio && audio.residual_is_silent_or_identical !== true) {
    const payload = {
      kind: "PROGRAM_AUDIO_DELTA",
      index: 0,
      start_frame: null,
      end_frame: null,
      start_seconds: 0,
      end_seconds: null,
      residual_rms_dbfs: finite(audio.residual_rms_dbfs),
      residual_peak_dbfs: finite(audio.residual_peak_dbfs),
    };
    units.push({
      key: unitKey(comparisonIdentity, payload),
      ...payload,
      title: "Program audio changed",
      description: "Program-audio residual evidence indicates the decoded audio differs between master versions.",
    });
  }

  for (const [index, blocker] of list(report.metadata?.blockers).entries()) {
    const payload = {
      kind: "COMPARISON_LIMITATION",
      index,
      start_frame: null,
      end_frame: null,
      start_seconds: 0,
      end_seconds: null,
      blocker: text(blocker),
    };
    units.push({
      key: unitKey(comparisonIdentity, payload),
      ...payload,
      title: "Comparison limitation",
      description: text(blocker).replaceAll("_", " ").toLowerCase(),
    });
  }

  return units;
}

function latestDecisionMap(nodes, comparisonIdentity) {
  const decisions = nodes
    .filter((node) =>
      node.type === DECISION_TYPE &&
      node.metadata?.master_comparison_identity === comparisonIdentity &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    )
    .sort((left, right) =>
      Date.parse(left.created_at || 0) - Date.parse(right.created_at || 0),
    );
  const byKey = new Map();
  for (const decision of decisions) {
    byKey.set(decision.metadata?.change_key, decision);
  }
  return byKey;
}

function compactDecision(node) {
  if (!node) return null;
  return {
    id: node.id,
    change_key: node.metadata?.change_key || null,
    classification: node.metadata?.classification || null,
    resolution_state: node.metadata?.resolution_state || null,
    note: node.metadata?.note || "",
    annotation: node.metadata?.annotation || null,
    supersedes_decision_asset_node_id:
      node.metadata?.supersedes_decision_asset_node_id || null,
    reviewer_staff_account_id: node.metadata?.reviewer_staff_account_id || null,
    reviewed_at: node.metadata?.reviewed_at || node.created_at || null,
  };
}

function decisionResolved(decision) {
  if (!decision) return false;
  const classification = decision.metadata?.classification;
  if (classification === "EXPECTED") return true;
  return Boolean(
    classification === "UNEXPECTED" &&
    decision.metadata?.resolution_state === "RESOLVED",
  );
}

function decisionSetIdentity(comparisonIdentity, units, decisionByKey) {
  return digest({
    comparison_identity: comparisonIdentity,
    decisions: units.map((unit) => {
      const decision = decisionByKey.get(unit.key) || null;
      return {
        change_key: unit.key,
        decision_id: decision?.id || null,
        decision_identity: decision?.metadata?.decision_identity || null,
      };
    }),
  });
}

function currentResolution(nodes, comparisonIdentity, rightMaster, decisionIdentity) {
  return newestCreativeNode(nodes, (node) =>
    node.type === RESOLUTION_TYPE &&
    node.status === CREATIVE_ASSET_NODE_STATUS.APPROVED &&
    node.parent_asset_node_id === rightMaster.id &&
    node.metadata?.master_comparison_identity === comparisonIdentity &&
    node.metadata?.right_master_checksum === rightMaster.technical?.checksum &&
    node.metadata?.decision_set_identity === decisionIdentity &&
    node.metadata?.passed === true &&
    node.review?.human_reviewed === true &&
    node.review?.approved === true,
  );
}

function compactResolution(node) {
  if (!node) return null;
  return {
    id: node.id,
    passed: node.metadata?.passed === true,
    master_comparison_identity: node.metadata?.master_comparison_identity || null,
    decision_set_identity: node.metadata?.decision_set_identity || null,
    reviewed_change_count: finite(node.metadata?.reviewed_change_count, 0),
    unexpected_resolved_count: finite(node.metadata?.unexpected_resolved_count, 0),
    signed_by_staff_account_id: node.metadata?.signed_by_staff_account_id || null,
    signed_at: node.metadata?.signed_at || node.created_at || null,
  };
}

export function evaluateMasterDeltaReviewFromNodes({ nodes = [], render = null } = {}) {
  if (!render?.id) {
    return {
      required: false,
      passed: true,
      blocker: null,
      previous_master_asset_node_id: null,
      comparison_report_id: null,
      comparison_identity: null,
      change_count: 0,
      resolved_change_count: 0,
      open_change_count: 0,
      resolution: null,
    };
  }

  const masters = creativePrimaryMasters(nodes);
  const index = masters.findIndex((master) => master.id === render.id);
  if (index <= 0) {
    return {
      required: false,
      passed: true,
      blocker: null,
      previous_master_asset_node_id: null,
      comparison_report_id: null,
      comparison_identity: null,
      change_count: 0,
      resolved_change_count: 0,
      open_change_count: 0,
      resolution: null,
    };
  }
  if (index !== masters.length - 1) {
    return {
      required: true,
      passed: false,
      blocker: "CURRENT_PRIMARY_MASTER_REQUIRED_FOR_DELTA_REVIEW",
      previous_master_asset_node_id: masters[index - 1]?.id || null,
      comparison_report_id: null,
      comparison_identity: null,
      change_count: 0,
      resolved_change_count: 0,
      open_change_count: 0,
      resolution: null,
    };
  }

  const previous = masters[index - 1];
  const report = comparisonReportFor(nodes, previous.id, render.id);
  if (!report) {
    return {
      required: true,
      passed: false,
      blocker: "MASTER_DELTA_COMPARISON_REQUIRED",
      previous_master_asset_node_id: previous.id,
      comparison_report_id: null,
      comparison_identity: null,
      change_count: 0,
      resolved_change_count: 0,
      open_change_count: 0,
      resolution: null,
    };
  }

  if (report.metadata?.visual?.changed_intervals_truncated === true) {
    return {
      required: true,
      passed: false,
      blocker: "MASTER_DELTA_INTERVAL_EVIDENCE_TRUNCATED",
      previous_master_asset_node_id: previous.id,
      comparison_report_id: report.id,
      comparison_identity: report.metadata?.master_comparison_identity || null,
      change_count: finite(report.metadata?.visual?.changed_intervals_total, 0),
      resolved_change_count: 0,
      open_change_count: finite(report.metadata?.visual?.changed_intervals_total, 0),
      resolution: null,
    };
  }

  const units = reviewUnits(report);
  const comparisonIdentity = report.metadata?.master_comparison_identity || null;
  const decisionByKey = latestDecisionMap(nodes, comparisonIdentity);
  const resolved = units.filter((unit) => decisionResolved(decisionByKey.get(unit.key)));
  const open = units.filter((unit) => !decisionResolved(decisionByKey.get(unit.key)));
  const decisionIdentity = decisionSetIdentity(comparisonIdentity, units, decisionByKey);
  const resolution = currentResolution(nodes, comparisonIdentity, render, decisionIdentity);

  if (!units.length) {
    return {
      required: true,
      passed: true,
      blocker: null,
      previous_master_asset_node_id: previous.id,
      comparison_report_id: report.id,
      comparison_identity: comparisonIdentity,
      change_count: 0,
      resolved_change_count: 0,
      open_change_count: 0,
      decision_set_identity: decisionIdentity,
      resolution: null,
      no_detected_content_delta: true,
    };
  }

  return {
    required: true,
    passed: Boolean(!open.length && resolution),
    blocker: open.length
      ? "MASTER_DELTA_INTERVAL_REVIEW_REQUIRED"
      : resolution
        ? null
        : "MASTER_REVISION_RESOLUTION_REQUIRED",
    previous_master_asset_node_id: previous.id,
    comparison_report_id: report.id,
    comparison_identity: comparisonIdentity,
    change_count: units.length,
    resolved_change_count: resolved.length,
    open_change_count: open.length,
    decision_set_identity: decisionIdentity,
    resolution: compactResolution(resolution),
    no_detected_content_delta: false,
  };
}

async function inspectInternal({ organization_id, creative_project_id, right_master_asset_node_id = null } = {}) {
  const [project, nodes] = await Promise.all([
    CreativeProjectRepository.getById(creative_project_id),
    AssetGraphRepository.listByProject({ organization_id, creative_project_id }),
  ]);
  if (!project || text(project.organization_id) !== text(organization_id)) {
    throw new Error("Creative project not found");
  }

  const masters = creativePrimaryMasters(nodes);
  const right = right_master_asset_node_id
    ? masters.find((master) => master.id === right_master_asset_node_id) || null
    : masters.at(-1) || null;
  if (!right) {
    return {
      contract: CONTRACT,
      required: false,
      passed: true,
      blocker: null,
      master: null,
      previous_master: null,
      comparison: null,
      units: [],
      resolution: null,
    };
  }

  const index = masters.findIndex((master) => master.id === right.id);
  const previous = index > 0 ? masters[index - 1] : null;
  if (!previous) {
    return {
      contract: CONTRACT,
      required: false,
      passed: true,
      blocker: null,
      master: { id: right.id, checksum: right.technical?.checksum || null },
      previous_master: null,
      comparison: null,
      units: [],
      resolution: null,
    };
  }

  const report = comparisonReportFor(nodes, previous.id, right.id);
  const state = evaluateMasterDeltaReviewFromNodes({ nodes, render: right });
  if (!report) {
    return {
      contract: CONTRACT,
      ...state,
      master: { id: right.id, checksum: right.technical?.checksum || null },
      previous_master: { id: previous.id, checksum: previous.technical?.checksum || null },
      comparison: null,
      units: [],
    };
  }

  const units = reviewUnits(report);
  const comparisonIdentity = report.metadata?.master_comparison_identity || null;
  const decisionByKey = latestDecisionMap(nodes, comparisonIdentity);
  const enrichedUnits = units.map((unit) => ({
    ...unit,
    decision: compactDecision(decisionByKey.get(unit.key)),
    resolved: decisionResolved(decisionByKey.get(unit.key)),
  }));

  return {
    contract: CONTRACT,
    ...state,
    master: { id: right.id, checksum: right.technical?.checksum || null },
    previous_master: { id: previous.id, checksum: previous.technical?.checksum || null },
    comparison: {
      report_id: report.id,
      identity: comparisonIdentity,
      evaluated_at: report.metadata?.evaluated_at || report.created_at || null,
      visual: report.metadata?.visual || null,
      audio: report.metadata?.audio || null,
      blockers: list(report.metadata?.blockers),
    },
    units: enrichedUnits,
  };
}

export const CreativeMasterDeltaReviewRuntime = Object.freeze({
  contract: CONTRACT,

  async inspect(input = {}) {
    if (!input.organization_id) throw new Error("organization_id required");
    if (!input.creative_project_id) throw new Error("creative_project_id required");
    return inspectInternal(input);
  },

  async decide({
    organization_id,
    creative_project_id,
    right_master_asset_node_id = null,
    change_key,
    classification,
    resolution_state = null,
    note = "",
    annotation = null,
    actor,
  } = {}) {
    const reviewer = normalizeActor(actor);
    const inspection = await inspectInternal({
      organization_id,
      creative_project_id,
      right_master_asset_node_id,
    });
    const unit = inspection.units.find((entry) => entry.key === change_key);
    if (!unit) throw new Error("CURRENT_MASTER_CHANGE_UNIT_REQUIRED");

    const normalizedClassification = text(classification).toUpperCase();
    if (!CLASSIFICATIONS.has(normalizedClassification)) {
      throw new Error("MASTER_CHANGE_CLASSIFICATION_REQUIRED");
    }
    const normalizedResolution = text(
      resolution_state ||
      (normalizedClassification === "EXPECTED" ? "NONE" : "OPEN"),
    ).toUpperCase();
    if (!RESOLUTION_STATES.has(normalizedResolution)) {
      throw new Error("MASTER_CHANGE_RESOLUTION_STATE_INVALID");
    }
    if (normalizedClassification === "EXPECTED" && normalizedResolution !== "NONE") {
      throw new Error("EXPECTED_CHANGE_RESOLUTION_STATE_MUST_BE_NONE");
    }
    if (normalizedClassification === "UNEXPECTED" && normalizedResolution === "NONE") {
      throw new Error("UNEXPECTED_CHANGE_REQUIRES_OPEN_OR_RESOLVED_STATE");
    }
    const decisionNote = text(note);
    if (normalizedClassification === "UNEXPECTED" && !decisionNote) {
      throw new Error("UNEXPECTED_CHANGE_NOTE_REQUIRED");
    }

    const previousDecision = unit.decision || null;
    const reviewedAt = new Date().toISOString();
    const decisionIdentity = digest({
      contract: CONTRACT,
      master_comparison_identity: inspection.comparison?.identity || null,
      change_key: unit.key,
      classification: normalizedClassification,
      resolution_state: normalizedResolution,
      note: decisionNote,
      annotation: annotation && typeof annotation === "object" ? annotation : null,
      reviewer_user_id: reviewer.user_id,
      reviewer_staff_account_id: reviewer.staff_account_id,
    });

    const nodes = await AssetGraphRepository.listByProject({ organization_id, creative_project_id });
    const existing = nodes.find((node) =>
      node.type === DECISION_TYPE && node.metadata?.decision_identity === decisionIdentity,
    );
    if (!existing) {
      const rightMasterId = inspection.master?.id;
      const decisionNode = createCreativeAssetNode({
        organization_id,
        creative_project_id,
        parent_asset_node_id: rightMasterId,
        type: DECISION_TYPE,
        status: decisionResolved({ metadata: {
          classification: normalizedClassification,
          resolution_state: normalizedResolution,
        } })
          ? CREATIVE_ASSET_NODE_STATUS.APPROVED
          : CREATIVE_ASSET_NODE_STATUS.REVIEW,
        name: `${unit.title} review decision`,
        description: decisionNote || unit.description,
        lineage: {
          source: "master_delta_human_review",
          capability: "creative.master.delta.review",
          generation_version: 1,
        },
        review: {
          ai_reviewed: false,
          human_reviewed: true,
          approved: decisionResolved({ metadata: {
            classification: normalizedClassification,
            resolution_state: normalizedResolution,
          } }),
          approved_by: reviewer.staff_account_id,
          notes: decisionNote,
        },
        metadata: {
          contract: CONTRACT,
          decision_identity: decisionIdentity,
          master_comparison_report_id: inspection.comparison?.report_id || null,
          master_comparison_identity: inspection.comparison?.identity || null,
          previous_master_asset_node_id: inspection.previous_master?.id || null,
          previous_master_checksum: inspection.previous_master?.checksum || null,
          right_master_asset_node_id: inspection.master?.id || null,
          right_master_checksum: inspection.master?.checksum || null,
          change_key: unit.key,
          change_kind: unit.kind,
          change_index: unit.index,
          start_frame: unit.start_frame ?? null,
          end_frame: unit.end_frame ?? null,
          start_seconds: unit.start_seconds ?? null,
          end_seconds: unit.end_seconds ?? null,
          classification: normalizedClassification,
          resolution_state: normalizedResolution,
          note: decisionNote,
          annotation: annotation && typeof annotation === "object" ? annotation : null,
          supersedes_decision_asset_node_id: previousDecision?.id || null,
          reviewer_user_id: reviewer.user_id,
          reviewer_staff_account_id: reviewer.staff_account_id,
          reviewer_email: reviewer.email,
          reviewed_at: reviewedAt,
        },
        created_by: reviewer.user_id,
      });
      await AssetGraphRepository.create(decisionNode);
    }

    return inspectInternal({
      organization_id,
      creative_project_id,
      right_master_asset_node_id,
    });
  },

  async finalize({
    organization_id,
    creative_project_id,
    right_master_asset_node_id = null,
    notes = "",
    actor,
  } = {}) {
    const reviewer = normalizeActor(actor);
    const inspection = await inspectInternal({
      organization_id,
      creative_project_id,
      right_master_asset_node_id,
    });
    if (!inspection.required) {
      throw new Error("MASTER_REVISION_RESOLUTION_NOT_REQUIRED");
    }
    if (!inspection.comparison?.report_id) {
      throw new Error("MASTER_DELTA_COMPARISON_REQUIRED");
    }
    if (inspection.blocker === "MASTER_DELTA_INTERVAL_EVIDENCE_TRUNCATED") {
      throw new Error(inspection.blocker);
    }
    if (inspection.units.some((unit) => !unit.resolved)) {
      throw new Error("MASTER_DELTA_INTERVAL_REVIEW_REQUIRED");
    }
    if (!inspection.units.length) {
      return inspection;
    }

    const decisionIds = inspection.units.map((unit) => unit.decision?.id).filter(Boolean);
    const decisionSetIdentity = inspection.decision_set_identity;
    const resolutionIdentity = digest({
      contract: CONTRACT,
      master_comparison_identity: inspection.comparison.identity,
      right_master_asset_node_id: inspection.master.id,
      right_master_checksum: inspection.master.checksum,
      decision_set_identity: decisionSetIdentity,
      signed_by_user_id: reviewer.user_id,
      signed_by_staff_account_id: reviewer.staff_account_id,
    });

    const nodes = await AssetGraphRepository.listByProject({ organization_id, creative_project_id });
    const existing = nodes.find((node) =>
      node.type === RESOLUTION_TYPE &&
      node.metadata?.revision_resolution_identity === resolutionIdentity,
    );
    if (existing) {
      return inspectInternal({
        organization_id,
        creative_project_id,
        right_master_asset_node_id,
      });
    }

    const signedAt = new Date().toISOString();
    const unexpectedResolved = inspection.units.filter((unit) =>
      unit.decision?.classification === "UNEXPECTED" &&
      unit.decision?.resolution_state === "RESOLVED",
    ).length;
    const node = createCreativeAssetNode({
      organization_id,
      creative_project_id,
      parent_asset_node_id: inspection.master.id,
      type: RESOLUTION_TYPE,
      status: CREATIVE_ASSET_NODE_STATUS.APPROVED,
      name: "Master revision resolution",
      description: "Authenticated human sign-off proving every detected master-version change unit is reviewed and resolved for the current master.",
      lineage: {
        source: "master_revision_resolution",
        capability: "creative.master.delta.finalize",
        generation_version: 1,
      },
      intelligence: {
        safety_status: "REVIEW_COMPLETE",
        tags: ["master-delta", "revision-resolution", "human-signoff"],
      },
      reuse: { reusable: false, approved_for_reuse: false },
      review: {
        ai_reviewed: false,
        human_reviewed: true,
        approved: true,
        approved_by: reviewer.staff_account_id,
        notes: text(notes),
      },
      metadata: {
        contract: CONTRACT,
        revision_resolution_identity: resolutionIdentity,
        passed: true,
        master_comparison_report_id: inspection.comparison.report_id,
        master_comparison_identity: inspection.comparison.identity,
        previous_master_asset_node_id: inspection.previous_master.id,
        previous_master_checksum: inspection.previous_master.checksum,
        right_master_asset_node_id: inspection.master.id,
        right_master_checksum: inspection.master.checksum,
        decision_set_identity: decisionSetIdentity,
        decision_ids: decisionIds,
        reviewed_change_count: inspection.units.length,
        unexpected_resolved_count: unexpectedResolved,
        signed_by_user_id: reviewer.user_id,
        signed_by_staff_account_id: reviewer.staff_account_id,
        signed_by_email: reviewer.email,
        signed_at: signedAt,
      },
      created_by: reviewer.user_id,
    });
    await AssetGraphRepository.create(node);

    return inspectInternal({
      organization_id,
      creative_project_id,
      right_master_asset_node_id,
    });
  },
});

export const CREATIVE_MASTER_DELTA_REVIEW_CONTRACT = CONTRACT;
export const CREATIVE_MASTER_CHANGE_DECISION_TYPE = DECISION_TYPE;
export const CREATIVE_MASTER_REVISION_RESOLUTION_TYPE = RESOLUTION_TYPE;
