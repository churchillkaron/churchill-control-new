import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeSoftwareProductionRuntime,
} from "./CreativeSoftwareProductionRuntime";
import {
  unwrapSoftwareOutput,
} from "./SoftwareContractRuntime";

export function localSoftwareOperation(task = {}) {
  const capability = String(task.capability || task.service_code || "").trim();
  if (capability === "creative.software.build") return "build";
  if (capability === "creative.software.validate") return "validate";
  const workflow = String(task.metadata?.workflow_kind || "").toUpperCase();
  const step = String(task.metadata?.production_step_id || "").toLowerCase();
  if (workflow === "SOFTWARE" && step === "build") return "build";
  if (workflow === "SOFTWARE" && step === "release-validation") return "validate";
  return null;
}

export function isSoftwareQualityTask(task = {}) {
  const workflow = String(task.metadata?.workflow_kind || "").toUpperCase();
  const step = String(task.metadata?.production_step_id || "").toLowerCase();
  return workflow === "SOFTWARE" &&
    step !== "release-validation" &&
    (task.metadata?.quality_gate === true || step === "quality" || step === "semantic-review");
}

export async function dispatchSoftwareTask(task) {
  const operation = localSoftwareOperation(task);
  if (!operation) return null;
  try {
    const output = operation === "build"
      ? await CreativeSoftwareProductionRuntime.build(task)
      : await CreativeSoftwareProductionRuntime.validate(task);
    return ProductionTaskRuntime.complete(task.id, {
      provider: "avantiqo-local-software-worker",
      settlement: "LOCAL_EXECUTION",
      output,
    });
  } catch (error) {
    return ProductionTaskRuntime.fail(task.id, error);
  }
}

export async function bindSoftwareEvidenceForReview(task) {
  if (task.metadata?.software_evidence_review_bound) return task;
  const dependencies = Array.isArray(task.depends_on) ? task.depends_on : [];
  const tasks = await ProductionTaskRuntime.list({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
  });
  const build = tasks.find((candidate) =>
    dependencies.includes(candidate.id) &&
    localSoftwareOperation(candidate) === "build" &&
    candidate.status === "COMPLETED",
  ) || tasks.find((candidate) =>
    localSoftwareOperation(candidate) === "build" &&
    candidate.status === "COMPLETED" &&
    candidate.metadata?.deliverable_id === task.metadata?.deliverable_id,
  );
  if (!build) throw new Error("CREATIVE_SOFTWARE_BUILD_NOT_COMPLETED");
  const output = unwrapSoftwareOutput(build.output);
  if (!output?.sandbox_report || !output?.build_artifact_url) {
    throw new Error("CREATIVE_SOFTWARE_BUILD_EVIDENCE_REQUIRED");
  }
  const prompt = [
    task.input?.prompt || task.input?.provider_prompt || "Review this completed software build evidence.",
    "Return only JSON with keys: passed, verdict, failed_checks, repair_instructions.",
    "Evaluate whether the implementation satisfies the declared architecture, runtime, entrypoint, build, tests, security controls, failure handling and deployment target.",
    "Do not approve merely because commands exited successfully. Reject missing requirements, unsafe design, weak tests, unresolved security findings or incomplete deployment evidence.",
  ].filter(Boolean).join("\n");
  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...(task.input || {}),
      prompt,
      provider_prompt: prompt,
      software_build: {
        task_id: build.id,
        source_package_url: output.source_package_url,
        build_artifact_url: output.build_artifact_url,
        checksum: output.checksum,
        contract_summary: output.contract_summary,
        sandbox_audit: output.sandbox_audit,
        sandbox_report: output.sandbox_report,
        deployment: output.deployment,
      },
    },
    metadata: {
      ...(task.metadata || {}),
      software_build_task_id: build.id,
      software_evidence_review_bound: true,
    },
  });
}
