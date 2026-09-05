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
  evaluateMasterDeltaReviewFromNodes,
} from "@/lib/creative/release/runtime/CreativeMasterDeltaReviewRuntime";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function newest(nodes, predicate) {
  return nodes
    .filter(predicate)
    .sort((left, right) =>
      Date.parse(right.updated_at || right.created_at || 0) -
      Date.parse(left.updated_at || left.created_at || 0),
    )[0] || null;
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

function qualityReport(nodes, renderId, source) {
  if (!renderId) return null;
  return newest(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
    node.parent_asset_node_id === renderId &&
    node.lineage?.source === source,
  );
}

function reportPassed(report) {
  return Boolean(
    report &&
    report.status !== CREATIVE_ASSET_NODE_STATUS.REJECTED &&
    report.metadata?.passed === true,
  );
}

function semanticEvidenceComplete(report) {
  return Boolean(
    reportPassed(report) &&
    list(report.metadata?.checks).length > 0 &&
    list(report.metadata?.sampled_frames).length +
      list(report.metadata?.sampled_clips).length > 0 &&
    (
      report.metadata?.policy?.require_audio_review === false ||
      list(report.metadata?.sampled_audio_segments).length > 0
    ) &&
    list(report.metadata?.validation_failures).length === 0 &&
    list(report.metadata?.failed_checks).length === 0,
  );
}

function identity(project, timeline, render, evidence, masterDeltaReview) {
  return crypto.createHash("sha256").update(JSON.stringify({
    project_id: project.id,
    project_updated_at: project.updated_at || null,
    timeline_id: timeline?.id || null,
    timeline_identity: timeline?.metadata?.timeline_identity || null,
    render_id: render?.id || null,
    render_identity:
      render?.metadata?.professional_master_audio_lock_identity ||
      render?.metadata?.finishing_identity ||
      render?.metadata?.render_identity ||
      null,
    final_master_audio_verified:
      render?.metadata?.final_master_audio_verified === true,
    master_delta_review: {
      required: masterDeltaReview?.required === true,
      passed: masterDeltaReview?.passed === true,
      comparison_identity: masterDeltaReview?.comparison_identity || null,
      decision_set_identity: masterDeltaReview?.decision_set_identity || null,
      resolution_id: masterDeltaReview?.resolution?.id || null,
      open_change_count: masterDeltaReview?.open_change_count || 0,
    },
    evidence: evidence.map((node) => ({
      id: node.id,
      type: node.type,
      source: node.lineage?.source || null,
      status: node.status,
      updated_at: node.updated_at || null,
      approved: node.review?.approved === true,
      passed: node.metadata?.passed ?? node.metadata?.technical_qc?.passed ?? null,
    })),
  })).digest("hex");
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
          (
            node.metadata?.timeline_asset_node_id === timeline.id ||
            node.parent_asset_node_id === timeline.id
          ),
        );

    const releasePolicy = project.metadata?.release || {};
    const releaseGatePolicy = project.metadata?.release_gate || {};
    const qualityPolicy = project.metadata?.quality_gate || {};
    const requireRender = releasePolicy.require_final_render !== false;
    const requireTechnicalQc = qualityPolicy.require_technical_qc !== false;
    const requireSemanticQc = qualityPolicy.require_semantic_qc !== false;
    const requireReleaseGate =
      releaseGatePolicy.require_before_release === true ||
      releaseGatePolicy.require_before_render === true;
    const requireHumanRenderApproval =
      releasePolicy.require_human_render_approval !== false;
    const requireHumanReleaseGateApproval =
      releaseGatePolicy.require_human_approval_before_release === true ||
      releaseGatePolicy.require_human_approval_before_render === true;

    const masterSoundtrackPresent = Boolean(
      render?.metadata?.master_soundtrack_contract_hash ||
      render?.metadata?.master_soundtrack_asset_node_id,
    );
    const professionalFinishingPresent = Boolean(
      render?.metadata?.professional_finishing_contract ||
      render?.metadata?.professional_master_audio_lock_contract,
    );
    const requireFinalMasterAudioIntegrity =
      masterSoundtrackPresent && professionalFinishingPresent;
    const finalMasterAudioIntegrityPassed = Boolean(
      render?.metadata?.master_soundtrack_integrity_passed_after_finishing === true &&
      render?.metadata?.final_master_audio_verified === true,
    );

    const technicalReport = qualityReport(nodes, render?.id, "perceptual_qc");
    const semanticReport = qualityReport(nodes, render?.id, "semantic_quality_review");
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
    const masterDeltaReview = evaluateMasterDeltaReviewFromNodes({ nodes, render });

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

    const technicalPassed = Boolean(
      render?.metadata?.technical_qc?.passed === true ||
      reportPassed(technicalReport),
    );
    const checks = [
      check("timeline_present", true, Boolean(timeline), timeline?.id || null, "No release timeline exists."),
      check("timeline_requirements_complete", true, list(timeline.metadata?.missing_requirements).length === 0, timeline.metadata?.missing_requirements || [], "Timeline has unresolved production requirements."),
      check("final_render_present", requireRender, Boolean(render), render?.id || null, "No final render exists for the selected timeline."),
      check("final_render_not_rejected", requireRender, Boolean(render) && render.status !== CREATIVE_ASSET_NODE_STATUS.REJECTED, render?.status || null, "Final render is rejected."),
      check("technical_qc_passed", requireTechnicalQc, technicalPassed, technicalReport?.id || render?.metadata?.technical_qc || null, "Technical signal quality control has not passed."),
      check(
        "final_master_soundtrack_integrity_passed",
        requireFinalMasterAudioIntegrity,
        finalMasterAudioIntegrityPassed,
        render?.metadata?.master_soundtrack_integrity_after_finishing || null,
        "Approved master soundtrack was not verified on the final post-finishing render.",
      ),
      check("semantic_quality_report_present", requireSemanticQc, Boolean(semanticReport), semanticReport?.id || null, "Semantic Creative quality evidence is missing."),
      check("semantic_quality_passed", requireSemanticQc, semanticEvidenceComplete(semanticReport), semanticReport?.metadata || null, "Semantic Creative quality review is incomplete or failed."),
      check(
        "master_revision_changes_resolved",
        masterDeltaReview.required === true,
        masterDeltaReview.passed === true,
        masterDeltaReview,
        masterDeltaReview.blocker || "Detected differences from the previous primary master require authenticated review and resolution.",
      ),
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
      technicalReport,
      semanticReport,
      releaseGateReport,
      releaseGateApproval,
      renderApproval,
      repairPlan,
      successfulRepairExecution,
    ].filter(Boolean);
    const readinessIdentity = identity(
      project,
      timeline,
      render,
      evidence,
      masterDeltaReview,
    );
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
      description: "Immutable release-readiness audit across timeline, final render, master-version change resolution, post-finishing master-audio integrity, technical evidence, semantic Creative review, rights and authenticated approvals.",
      lineage: {
        source: "release_readiness_audit",
        capability: "creative.release.readiness.evaluate",
        generation_version: 5,
      },
      intelligence: {
        safety_status: passed ? "REVIEW_REQUIRED" : "BLOCKED",
        tags: ["release-readiness", "semantic-quality-required", "final-master-audio-integrity", "master-delta-resolution"],
      },
      reuse: { reusable: false, approved_for_reuse: false },
      review: {
        ai_reviewed: true,
        human_reviewed: false,
        approved: false,
        notes: passed
          ? "All release checks passed; publishing still requires separate authenticated approval."
          : "Release is blocked by one or more failed readiness checks.",
      },
      metadata: {
        release_readiness_identity: readinessIdentity,
        timeline_asset_node_id: timeline.id,
        final_render_asset_node_id: render?.id || null,
        technical_quality_report_id: technicalReport?.id || null,
        semantic_quality_report_id: semanticReport?.id || null,
        master_delta_review_required: masterDeltaReview.required === true,
        master_delta_review_passed: masterDeltaReview.passed === true,
        master_delta_comparison_report_id: masterDeltaReview.comparison_report_id || null,
        master_delta_comparison_identity: masterDeltaReview.comparison_identity || null,
        master_delta_decision_set_identity: masterDeltaReview.decision_set_identity || null,
        master_revision_resolution_id: masterDeltaReview.resolution?.id || null,
        master_delta_change_count: masterDeltaReview.change_count || 0,
        master_delta_open_change_count: masterDeltaReview.open_change_count || 0,
        release_gate_report_id: releaseGateReport?.id || null,
        release_gate_approval_id: releaseGateApproval?.id || null,
        final_render_approval_id: renderApproval?.id || null,
        repair_plan_id: repairPlan?.id || null,
        successful_repair_execution_id: successfulRepairExecution?.id || null,
        open_repair_plan_id: openRepairPlan?.id || null,
        final_master_soundtrack_integrity_required:
          requireFinalMasterAudioIntegrity,
        final_master_soundtrack_integrity_passed:
          finalMasterAudioIntegrityPassed,
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
