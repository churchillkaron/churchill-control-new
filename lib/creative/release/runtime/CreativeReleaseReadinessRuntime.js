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

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function identity(project, timeline, render, evidence) {
  return crypto.createHash("sha256").update(JSON.stringify({
    project_id: project.id,
    project_updated_at: project.updated_at || null,
    timeline_id: timeline?.id || null,
    timeline_identity: timeline?.metadata?.timeline_identity || null,
    render_id: render?.id || null,
    render_identity: render?.metadata?.render_identity || null,
    evidence: evidence.map((node) => ({
      id: node.id,
      type: node.type,
      status: node.status,
      updated_at: node.updated_at || null,
      approved: node.review?.approved === true,
      passed: node.metadata?.passed ?? node.metadata?.technical_qc?.passed ?? null,
    })),
  })).digest("hex");
}

function check(id, required, passed, evidence = null, reason = null) {
  return {
    id,
    required: Boolean(required),
    passed: required ? Boolean(passed) : true,
    evidence,
    reason: required && !passed ? reason : null,
  };
}

function newest(nodes, predicate) {
  return nodes
    .filter(predicate)
    .sort((left, right) =>
      Date.parse(right.updated_at || right.created_at || 0) -
      Date.parse(left.updated_at || left.created_at || 0),
    )[0] || null;
}

function approvalFor(nodes, subjectId, scope) {
  if (!subjectId) return null;
  return newest(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.APPROVAL_RECORD &&
    node.parent_asset_node_id === subjectId &&
    node.status === CREATIVE_ASSET_NODE_STATUS.APPROVED &&
    node.metadata?.scope === scope &&
    node.metadata?.subject_asset_node_id === subjectId &&
    Boolean(node.metadata?.approver_user_id) &&
    Boolean(node.metadata?.approver_staff_account_id),
  );
}

export const CreativeReleaseReadinessRuntime = {
  async evaluate({
    organization_id,
    creative_project_id,
    timeline_asset_node_id = null,
    final_render_asset_node_id = null,
    force = false,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const project = await CreativeProjectRepository.getById(creative_project_id);
    if (!project || project.organization_id !== organization_id) {
      throw new Error("Creative project not found");
    }

    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id,
    });
    const timeline = timeline_asset_node_id
      ? nodes.find((node) => node.id === timeline_asset_node_id)
      : newest(nodes, (node) => node.type === CREATIVE_ASSET_NODE_TYPES.TIMELINE);
    if (!timeline || timeline.type !== CREATIVE_ASSET_NODE_TYPES.TIMELINE) {
      throw new Error("TIMELINE_REQUIRED_FOR_RELEASE_READINESS");
    }

    const render = final_render_asset_node_id
      ? nodes.find((node) => node.id === final_render_asset_node_id)
      : newest(nodes, (node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER &&
          node.parent_asset_node_id === timeline.id,
        );

    const releasePolicy = project.metadata?.release || {};
    const releaseGatePolicy = project.metadata?.release_gate || {};
    const qualityPolicy = project.metadata?.quality_gate || {};
    const requireRender = releasePolicy.require_final_render !== false;
    const requireTechnicalQc = qualityPolicy.require_technical_qc !== false;
    const requirePerceptualQc = qualityPolicy.require_perceptual_qc === true;
    const requireReleaseGate = releaseGatePolicy.require_before_release === true ||
      releaseGatePolicy.require_before_render === true;
    const requireHumanRenderApproval =
      releasePolicy.require_human_render_approval !== false;
    const requireHumanReleaseGateApproval =
      releaseGatePolicy.require_human_approval_before_release === true ||
      releaseGatePolicy.require_human_approval_before_render === true;

    const perceptualReport = render
      ? newest(nodes, (node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
          node.parent_asset_node_id === render.id &&
          node.lineage?.source === "perceptual_qc",
        )
      : null;
    const releaseGateReport = newest(nodes, (node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_GATE_REPORT &&
      node.parent_asset_node_id === timeline.id,
    );
    const releaseGateApproval = approvalFor(
      nodes,
      releaseGateReport?.id,
      "RELEASE_GATE",
    );
    const renderApproval = approvalFor(nodes, render?.id, "FINAL_RENDER");

    const repairPlan = render
      ? newest(nodes, (node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.REPAIR_PLAN &&
          node.parent_asset_node_id === render.id &&
          !node.metadata?.repair_execution_of,
        )
      : null;
    const successfulRepairExecution = repairPlan
      ? newest(nodes, (node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.REPAIR_PLAN &&
          node.metadata?.repair_execution_of === repairPlan.id &&
          node.metadata?.technical_qc?.passed === true,
        )
      : null;
    const openRepairPlan = repairPlan && !successfulRepairExecution
      ? repairPlan
      : null;

    const checks = [
      check("timeline_present", true, Boolean(timeline), timeline?.id || null, "No release timeline exists."),
      check("timeline_requirements_complete", true, list(timeline.metadata?.missing_requirements).length === 0, timeline.metadata?.missing_requirements || [], "Timeline has unresolved production requirements."),
      check("final_render_present", requireRender, Boolean(render), render?.id || null, "No final render exists for the selected timeline."),
      check("final_render_not_rejected", requireRender, Boolean(render) && render.status !== CREATIVE_ASSET_NODE_STATUS.REJECTED, render?.status || null, "Final render is rejected."),
      check("technical_qc_passed", requireTechnicalQc, render?.metadata?.technical_qc?.passed === true, render?.metadata?.technical_qc || null, "Technical quality control has not passed."),
      check("perceptual_qc_passed", requirePerceptualQc, perceptualReport?.metadata?.passed === true, perceptualReport?.id || null, "Perceptual quality control has not passed."),
      check("release_gate_passed", requireReleaseGate, releaseGateReport?.metadata?.passed === true, releaseGateReport?.id || null, "Rights, consent, licence or identity release gate has not passed."),
      check("release_gate_human_approved", requireHumanReleaseGateApproval, Boolean(releaseGateApproval), releaseGateApproval?.id || null, "Release-gate evidence lacks authenticated staff approval."),
      check("final_render_human_approved", requireHumanRenderApproval, Boolean(renderApproval), renderApproval?.id || null, "Final render lacks authenticated staff approval."),
      check("no_open_repair_plan", true, !openRepairPlan, openRepairPlan?.id || null, "An unresolved repair plan remains attached to the final render."),
      check("publish_targets_configured", releasePolicy.require_publish_targets === true, list(project.metadata?.publish_targets).length > 0, project.metadata?.publish_targets || [], "No publishing targets are configured."),
    ];

    const passed = checks.every((item) => item.passed);
    const evidence = [
      timeline,
      render,
      perceptualReport,
      releaseGateReport,
      releaseGateApproval,
      renderApproval,
      repairPlan,
      successfulRepairExecution,
    ].filter(Boolean);
    const readinessIdentity = identity(project, timeline, render, evidence);
    const existing = !force
      ? nodes.find((node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_READINESS_REPORT &&
          node.metadata?.release_readiness_identity === readinessIdentity,
        )
      : null;
    if (existing) return { report: existing, reused: true };

    const report = createCreativeAssetNode({
      organization_id,
      creative_project_id,
      parent_asset_node_id: render?.id || timeline.id,
      type: CREATIVE_ASSET_NODE_TYPES.RELEASE_READINESS_REPORT,
      status: passed
        ? CREATIVE_ASSET_NODE_STATUS.REVIEW
        : CREATIVE_ASSET_NODE_STATUS.REJECTED,
      name: `${project.name || "Creative project"} release readiness`,
      description: "Immutable release-readiness audit across timeline, evidence, render, quality and authenticated approvals.",
      lineage: {
        source: "release_readiness_audit",
        capability: "creative.release.readiness.evaluate",
        generation_version: 2,
      },
      intelligence: {
        safety_status: passed ? "UNKNOWN" : "BLOCKED",
        tags: ["release-readiness"],
      },
      reuse: { reusable: false, approved_for_reuse: false },
      review: {
        ai_reviewed: true,
        human_reviewed: false,
        approved: false,
        notes: passed
          ? "All configured release checks passed; publishing requires a separate authenticated publish approval."
          : "Release is blocked by one or more failed readiness checks.",
      },
      metadata: {
        release_readiness_identity: readinessIdentity,
        timeline_asset_node_id: timeline.id,
        final_render_asset_node_id: render?.id || null,
        release_gate_report_id: releaseGateReport?.id || null,
        release_gate_approval_id: releaseGateApproval?.id || null,
        final_render_approval_id: renderApproval?.id || null,
        perceptual_quality_report_id: perceptualReport?.id || null,
        repair_plan_id: repairPlan?.id || null,
        successful_repair_execution_id: successfulRepairExecution?.id || null,
        open_repair_plan_id: openRepairPlan?.id || null,
        passed,
        checks,
        failed_checks: checks.filter((item) => !item.passed).map((item) => item.id),
        evaluated_at: new Date().toISOString(),
      },
    });

    return {
      report: await AssetGraphRepository.create(report),
      reused: false,
    };
  },
};
