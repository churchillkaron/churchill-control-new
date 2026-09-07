import crypto from "node:crypto";

import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";

const CONTRACT = "AVANTIQO_END_TO_END_FILM_CERTIFICATION_V1";
const INVESTOR_FIRST_MINUTE_PROFILE = "AVANTIQO_INVESTOR_FILM_FIRST_MINUTE_CERTIFICATION_V1";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function digest(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function latest(nodes, predicate) {
  return [...nodes].filter(predicate).sort((a, b) =>
    Date.parse(b.updated_at || b.created_at || 0) - Date.parse(a.updated_at || a.created_at || 0),
  )[0] || null;
}
function activeTask(task = {}) {
  return !task.metadata?.superseded_by_repair_task_id &&
    !task.metadata?.superseded_by_repair_review_task_id;
}
function manualIntermediate(node = {}) {
  const source = text(node.lineage?.source).toLowerCase();
  if (!source || source === "manual") {
    return ["VIDEO", "AUDIO", "MUSIC", "SFX", "TIMELINE", "FINAL_RENDER"]
      .includes(text(node.type).toUpperCase());
  }
  return false;
}
function check(id, passed, evidence = null, blocker = id) {
  return { id, passed: Boolean(passed), blocker: passed ? null : blocker, evidence };
}

export const CreativeEndToEndFilmCertificationRuntime = Object.freeze({
  contract: CONTRACT,
  investor_first_minute_profile: INVESTOR_FIRST_MINUTE_PROFILE,
  provider_calls_executed: 0,
  manual_intermediate_fixes_allowed: false,

  async inspect({ organization_id, creative_project_id, profile = null } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    const [project, tasks, nodes] = await Promise.all([
      CreativeProjectRepository.getById(creative_project_id),
      ProductionTaskRuntime.list({ organization_id, creative_project_id }),
      AssetGraphRepository.listByProject({ organization_id, creative_project_id }),
    ]);
    if (!project || text(project.organization_id) !== text(organization_id)) {
      throw new Error("Creative project not found");
    }

    const active = tasks.filter(activeTask);
    const finalRender = latest(nodes, (node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.REJECTED,
    );
    const mastering = latest(nodes, (node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
      node.metadata?.contract === "AVANTIQO_FINAL_MASTERING_V1" &&
      node.metadata?.passed === true,
    );
    const delivery = latest(nodes, (node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
      node.metadata?.contract === "CREATIVE_TEMPORAL_CHANNEL_DELIVERY_V4" &&
      node.metadata?.passed === true,
    );
    const releasePackage = latest(nodes, (node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_PACKAGE,
    );
    const selectedCandidates = nodes.filter((node) =>
      node.metadata?.shot_candidate_selected === true &&
      node.metadata?.selected_for_master === true,
    );
    const temporalTasks = active.filter((task) =>
      text(task.metadata?.workflow_kind).toUpperCase() === "TEMPORAL",
    );
    const directingTasks = temporalTasks.filter((task) =>
      Boolean(task.input?.requirements?.directing_intelligence || task.metadata?.directing_intelligence_contract),
    );
    const escalationTasks = temporalTasks.filter((task) =>
      Boolean(task.input?.requirements?.story_escalation || task.metadata?.story_escalation_contract),
    );
    const unauthorizedManual = nodes.filter(manualIntermediate);
    const unresolved = active.filter((task) =>
      ["FAILED", "SKIPPED", "BLOCKED", "RUNNING", "WAITING", "PLANNING", "PLANNED", "READY", "REVIEW"]
        .includes(text(task.status).toUpperCase()),
    );
    const firstMinute = profile === INVESTOR_FIRST_MINUTE_PROFILE;
    const duration = finite(finalRender?.technical?.duration_seconds);

    const checks = [
      check("temporal_workflow_present", temporalTasks.length > 0, temporalTasks.length),
      check("directing_intelligence_reaches_temporal_tasks",
        directingTasks.length > 0 && directingTasks.length === temporalTasks.filter((task) => text(task.metadata?.node_type).toUpperCase() === "SHOT").length,
        { directing_task_count: directingTasks.length, temporal_shot_task_count: temporalTasks.filter((task) => text(task.metadata?.node_type).toUpperCase() === "SHOT").length }),
      check("story_escalation_evidence_present", escalationTasks.length > 0, escalationTasks.length),
      check("autonomous_candidate_winners_present", selectedCandidates.length > 0, selectedCandidates.length),
      check("no_unauthorized_manual_intermediate_media", unauthorizedManual.length === 0,
        unauthorizedManual.map((node) => node.id)),
      check("all_active_production_tasks_settled", unresolved.length === 0,
        unresolved.map((task) => ({ id: task.id, status: task.status }))),
      check("final_render_present", Boolean(finalRender?.id && finalRender?.url), finalRender?.id || null),
      check("final_mastering_sealed", Boolean(
        mastering?.metadata?.final_mastering_seal_hash && mastering?.metadata?.master_checksum,
      ), mastering?.id || null),
      check("delivery_uses_exact_certified_master_bytes", Boolean(
        delivery?.metadata?.derivatives_generated_from_exact_certified_master_bytes === true &&
        delivery?.metadata?.timeline_rerender_for_delivery_forbidden === true,
      ), delivery?.id || null),
      check("release_package_exists", Boolean(releasePackage?.id), releasePackage?.id || null),
      check("publication_not_implied_by_certification",
        !nodes.some((node) => node.metadata?.publication_authorized === true && node.lineage?.source === "end_to_end_film_certification"),
        true),
      ...(firstMinute ? [
        check("investor_first_minute_duration", duration !== null && duration >= 59.5 && duration <= 60.5,
          duration, "INVESTOR_FIRST_MINUTE_DURATION_NOT_CERTIFIED"),
        check("investor_first_minute_realistic_human_evidence",
          nodes.some((node) =>
            node.metadata?.shot_candidate_hard_human_quality_passed === true &&
            node.metadata?.selected_for_master === true),
          null, "INVESTOR_FIRST_MINUTE_HUMAN_QUALITY_NOT_CERTIFIED"),
      ] : []),
    ];
    const failed = checks.filter((item) => !item.passed);
    return {
      contract: CONTRACT,
      profile: profile || "GENERAL_TEMPORAL_FILM",
      project_id: creative_project_id,
      passed: failed.length === 0,
      status: failed.length ? "BLOCKED" : "CERTIFIED",
      checks,
      blockers: failed.map((item) => item.blocker),
      evidence: {
        task_count: tasks.length,
        asset_node_count: nodes.length,
        selected_candidate_count: selectedCandidates.length,
        final_render_asset_node_id: finalRender?.id || null,
        final_mastering_report_id: mastering?.id || null,
        channel_delivery_report_id: delivery?.id || null,
        release_package_asset_node_id: releasePackage?.id || null,
      },
      provider_calls_executed: 0,
      certification_does_not_authorize_publication: true,
    };
  },

  async certify(input = {}) {
    const result = await this.inspect(input);
    const nodes = await AssetGraphRepository.listByProject({
      organization_id: input.organization_id,
      creative_project_id: input.creative_project_id,
    });
    const identity = digest({
      contract: CONTRACT,
      profile: result.profile,
      checks: result.checks.map(({ id, passed, evidence }) => ({ id, passed, evidence })),
    });
    const existing = nodes.find((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
      node.metadata?.end_to_end_film_certification_identity === identity,
    );
    if (existing) return { ...result, report: existing, reused: true };

    const report = await AssetGraphRepository.create(createCreativeAssetNode({
      organization_id: input.organization_id,
      creative_project_id: input.creative_project_id,
      parent_asset_node_id: result.evidence.final_render_asset_node_id,
      type: CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT,
      status: result.passed ? CREATIVE_ASSET_NODE_STATUS.REVIEW : CREATIVE_ASSET_NODE_STATUS.REJECTED,
      name: "End-to-end autonomous film certification",
      description: "Evidence that the real temporal production traversed the governed Avantiqo filmmaking pipeline without unauthorized manual intermediate fixes.",
      lineage: { source: "end_to_end_film_certification", capability: "creative.film.certify", generation_version: 1 },
      intelligence: { quality_score: result.passed ? 100 : 0, safety_status: result.passed ? "REVIEW_REQUIRED" : "REJECTED", tags: ["end-to-end", "autonomous-film", "production-proof"] },
      reuse: { reusable: false, approved_for_reuse: false },
      review: { ai_reviewed: true, human_reviewed: false, approved: false, notes: result.passed ? "Production proof passed. This does not authorize publication." : `Blocked: ${result.blockers.join(", ")}` },
      metadata: {
        contract: CONTRACT,
        end_to_end_film_certification_identity: identity,
        profile: result.profile,
        passed: result.passed,
        status: result.status,
        checks: result.checks,
        blockers: result.blockers,
        evidence: result.evidence,
        manual_intermediate_fixes_allowed: false,
        publication_authorized: false,
        provider_calls_executed: 0,
        certified_at: new Date().toISOString(),
      },
    }));
    return { ...result, report, reused: false };
  },
});
