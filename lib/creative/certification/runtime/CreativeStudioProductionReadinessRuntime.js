import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeWorldClassBenchmarkRuntime } from "./CreativeWorldClassBenchmarkRuntime";
import { CreativeEndToEndFilmCertificationRuntime } from "./CreativeEndToEndFilmCertificationRuntime";

const CONTRACT = "AVANTIQO_STUDIO_PRODUCTION_READINESS_V1";

function text(value) { return String(value ?? "").trim(); }
function active(task = {}) {
  return !task.metadata?.superseded_by_revision_task_id &&
    !task.metadata?.superseded_by_repair_task_id &&
    !task.metadata?.superseded_by_repair_review_task_id;
}
function check(id, passed, evidence = null, blocker = id) {
  return { id, passed: Boolean(passed), evidence, blocker: passed ? null : blocker };
}
function settled(status) {
  return ["COMPLETED", "CANCELLED", "SUPERSEDED"].includes(text(status).toUpperCase());
}

export const CreativeStudioProductionReadinessRuntime = Object.freeze({
  contract: CONTRACT,
  production_deployment_authorized: false,
  provider_calls_executed: 0,

  async inspect({ organization_id, creative_project_id, certification_profile = null } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    const [project, tasks, nodes, benchmark, filmCertification] = await Promise.all([
      CreativeProjectRepository.getById(creative_project_id),
      ProductionTaskRuntime.list({ organization_id, creative_project_id }),
      AssetGraphRepository.listByProject({ organization_id, creative_project_id }),
      CreativeWorldClassBenchmarkRuntime.inspect({ organization_id, creative_project_id }),
      CreativeEndToEndFilmCertificationRuntime.inspect({ organization_id, creative_project_id, profile: certification_profile }),
    ]);
    if (!project || text(project.organization_id) !== text(organization_id)) {
      throw new Error("Creative project not found");
    }
    const current = tasks.filter(active);
    const unresolved = current.filter((task) => !settled(task.status));
    const crossOrgTasks = tasks.filter((task) => text(task.organization_id) !== text(organization_id));
    const crossOrgNodes = nodes.filter((node) => text(node.organization_id) !== text(organization_id));
    const pendingSettlement = current.filter((task) =>
      task.metadata?.pending_settlement === true ||
      task.cost?.pending_settlement === true ||
      text(task.metadata?.settlement_status).toUpperCase() === "PENDING",
    );
    const unapprovedPublication = nodes.filter((node) =>
      node.metadata?.publication_authorized === true &&
      node.review?.approved !== true,
    );
    const hasReleasePackage = nodes.some((node) => text(node.type).toUpperCase() === "RELEASE_PACKAGE");
    const sealedMaster = nodes.some((node) =>
      text(node.type).toUpperCase() === "QUALITY_REPORT" &&
      node.metadata?.contract === "AVANTIQO_FINAL_MASTERING_V1" &&
      node.metadata?.passed === true &&
      Boolean(node.metadata?.final_mastering_seal_hash && node.metadata?.master_checksum),
    );
    const resumeEvidence = current.length === 0 || current.every((task) =>
      task.metadata?.task_materialization_idempotent === true ||
      task.metadata?.task_materialization_contract ||
      settled(task.status),
    );

    const checks = [
      check("organization_isolation", crossOrgTasks.length === 0 && crossOrgNodes.length === 0,
        { cross_org_tasks: crossOrgTasks.length, cross_org_assets: crossOrgNodes.length }),
      check("production_queue_settled", current.length > 0 && unresolved.length === 0,
        unresolved.map((task) => ({ id: task.id, status: task.status })), "PRODUCTION_QUEUE_NOT_FULLY_SETTLED"),
      check("wallet_and_cost_settlement_clear", pendingSettlement.length === 0,
        pendingSettlement.map((task) => task.id), "PENDING_USAGE_OR_WALLET_SETTLEMENT"),
      check("resume_after_failure_contract_present", resumeEvidence,
        { task_count: current.length }, "RESUME_IDEMPOTENCY_NOT_PROVEN"),
      check("world_class_benchmark_passed", benchmark.passed === true,
        { passed: benchmark.passed, passed_case_count: benchmark.passed_case_count, case_count: benchmark.case_count }, "WORLD_CLASS_BENCHMARK_NOT_CERTIFIED"),
      check("real_end_to_end_film_certified", filmCertification.passed === true,
        { passed: filmCertification.passed, blockers: filmCertification.blockers }, "REAL_END_TO_END_FILM_NOT_CERTIFIED"),
      check("sealed_final_master_present", sealedMaster, null, "SEALED_FINAL_MASTER_REQUIRED"),
      check("release_package_present", hasReleasePackage, null, "RELEASE_PACKAGE_REQUIRED"),
      check("publication_approval_boundary_intact", unapprovedPublication.length === 0,
        unapprovedPublication.map((node) => node.id), "PUBLICATION_AUTHORITY_WITHOUT_APPROVAL"),
      check("load_and_concurrency_certification_required",
        project.metadata?.studio_load_certification?.passed === true,
        project.metadata?.studio_load_certification || null,
        "STUDIO_LOAD_CONCURRENCY_CERTIFICATION_REQUIRED"),
      check("runtime_recovery_certification_required",
        project.metadata?.studio_failure_recovery_certification?.passed === true,
        project.metadata?.studio_failure_recovery_certification || null,
        "STUDIO_FAILURE_RECOVERY_CERTIFICATION_REQUIRED"),
    ];
    const failed = checks.filter((item) => !item.passed);
    return {
      contract: CONTRACT,
      project_id: creative_project_id,
      passed: failed.length === 0,
      status: failed.length ? "BLOCKED" : "PRODUCTION_READY",
      checks,
      blockers: failed.map((item) => item.blocker),
      benchmark,
      film_certification: filmCertification,
      production_deployment_authorized: false,
      explicit_deployment_approval_still_required: true,
      provider_calls_executed: 0,
    };
  },
});
