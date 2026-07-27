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
  if (workflow === "SOFTWARE" && step === "sandbox-build") return "build";
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

export async function ensureSoftwareBuildTask(qualityTask) {
  const tasks = await ProductionTaskRuntime.list({
    organization_id: qualityTask.organization_id,
    creative_project_id: qualityTask.creative_project_id,
  });
  let build = tasks.find((task) =>
    task.metadata?.software_build_for_task_id === qualityTask.id,
  ) || null;
  if (!build) {
    build = await ProductionTaskRuntime.create({
      organization_id: qualityTask.organization_id,
      creative_project_id: qualityTask.creative_project_id,
      production_graph_id: qualityTask.production_graph_id,
      type: "EXECUTE_CAPABILITY",
      status: "WAITING",
      title: `Build ${qualityTask.title || "software deliverable"}`,
      description: "Execute the AI-generated source package inside the configured isolated build sandbox.",
      service_id: "creative.software.build",
      service_code: "creative.software.build",
      capability: "creative.software.build",
      priority: Math.max(0, Number(qualityTask.priority || 100) - 1),
      depends_on: Array.isArray(qualityTask.depends_on) ? qualityTask.depends_on : [],
      input: {
        ...(qualityTask.input || {}),
        output_spec:
          qualityTask.metadata?.requirements?.output_spec ||
          qualityTask.input?.requirements?.output_spec ||
          qualityTask.input?.output_spec ||
          qualityTask.metadata?.output_spec ||
          {},
      },
      cost: {
        estimated: 0,
        actual: 0,
        currency: qualityTask.cost?.currency || null,
        approved: true,
      },
      timing: { estimated_seconds: 0 },
      review: { required: false, approved: false },
      metadata: {
        ...(qualityTask.metadata || {}),
        output_spec:
          qualityTask.metadata?.requirements?.output_spec ||
          qualityTask.metadata?.output_spec ||
          {},
        execution_node_id: `${qualityTask.metadata?.execution_node_id || qualityTask.id}:software-build`,
        execution_step_id: `${qualityTask.metadata?.execution_step_id || qualityTask.id}:software-build`,
        production_step_id: "sandbox-build",
        production_step_index: Number(qualityTask.metadata?.production_step_index || 2) - 0.5,
        quality_gate: false,
        release_candidate: true,
        software_build_for_task_id: qualityTask.id,
      },
    });
  }
  await ProductionTaskRuntime.update(qualityTask.id, {
    depends_on: [build.id],
    metadata: {
      ...(qualityTask.metadata || {}),
      software_build_task_id: build.id,
      release_candidate: false,
    },
  });
  return build;
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
  if (!task.metadata?.software_build_task_id) {
    return ensureSoftwareBuildTask(task);
  }
  const build = await ProductionTaskRuntime.get(task.metadata.software_build_task_id);
  if (!build || build.status !== "COMPLETED") {
    throw new Error("CREATIVE_SOFTWARE_BUILD_NOT_COMPLETED");
  }
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
      software_evidence_review_bound: true,
    },
  });
}
