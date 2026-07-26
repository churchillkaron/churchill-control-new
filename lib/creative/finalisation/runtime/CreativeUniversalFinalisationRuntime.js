import crypto from "node:crypto";

import { CreativeStateEngine, PIPELINE_STAGES } from "@/lib/creative/state/CreativeStateEngine";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

const UNIVERSAL_WORKFLOWS = new Set([
  "STILL",
  "DOCUMENT",
  "INTERACTIVE",
  "SOFTWARE",
  "AUDIO",
  "CAMPAIGN_SYSTEM",
]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function workflowKind(project = {}, tasks = []) {
  const declared = text(
    project.metadata?.workflow_kind ||
      project.metadata?.creative_medium ||
      tasks.find((task) => task.metadata?.workflow_kind)?.metadata?.workflow_kind ||
      project.production_type,
  ).toUpperCase();
  const map = {
    IMAGE: "STILL",
    POSTER: "STILL",
    BANNER: "STILL",
    STILL: "STILL",
    DOCUMENT: "DOCUMENT",
    MENU: "DOCUMENT",
    PRESENTATION: "DOCUMENT",
    REPORT: "DOCUMENT",
    BROCHURE: "DOCUMENT",
    WEBSITE: "INTERACTIVE",
    WEBPAGE: "INTERACTIVE",
    LANDING_PAGE: "INTERACTIVE",
    INTERACTIVE: "INTERACTIVE",
    APPLICATION: "SOFTWARE",
    APP: "SOFTWARE",
    SOFTWARE: "SOFTWARE",
    AUDIO: "AUDIO",
    VOICE: "AUDIO",
    MUSIC: "AUDIO",
    PODCAST: "AUDIO",
    MULTIMEDIA: "CAMPAIGN_SYSTEM",
    CAMPAIGN: "CAMPAIGN_SYSTEM",
    CAMPAIGN_SYSTEM: "CAMPAIGN_SYSTEM",
  };
  return map[declared] || declared;
}

function unwrap(value) {
  let current = value;
  const seen = new Set();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const next =
      current.output ||
      current.result ||
      current.json ||
      current.data ||
      null;
    if (!next || next === current) break;
    current = next;
  }
  return current;
}

function resolvedUrl(value = {}) {
  const sources = [value, value.output, value.result, value.provider_submission];
  for (const source of sources.filter(Boolean)) {
    const candidate = unwrap(source);
    const url =
      candidate?.url ||
      candidate?.file_url ||
      candidate?.fileUrl ||
      candidate?.image_url ||
      candidate?.imageUrl ||
      candidate?.video_url ||
      candidate?.videoUrl ||
      candidate?.audio_url ||
      candidate?.audioUrl ||
      candidate?.deployment_url ||
      candidate?.preview_url ||
      candidate?.download_url ||
      candidate?.files?.[0]?.url ||
      null;
    if (url) return url;
  }
  return null;
}

function meaningfulPayload(task = {}) {
  const candidates = [
    task.output?.output,
    task.output?.result,
    task.output?.provider_submission?.output,
    task.output?.provider_submission,
    task.output,
  ];
  for (const candidate of candidates) {
    const value = unwrap(candidate);
    if (typeof value === "string" && text(value)) return value;
    if (Array.isArray(value) && value.length) return value;
    if (value && typeof value === "object") {
      const keys = Object.keys(value).filter((key) => ![
        "usage",
        "pricing",
        "billing",
        "settlement",
        "provider_job_id",
        "provider_status",
        "credential_id",
      ].includes(key));
      if (keys.length) return value;
    }
  }
  return null;
}

function qualityEvidence(task = {}) {
  const candidates = [
    task.output?.result?.json,
    task.output?.result,
    task.output?.output?.json,
    task.output?.output,
    task.output?.provider_submission?.output?.json,
    task.output?.provider_submission?.output,
    task.output?.provider_submission,
    task.output,
  ];
  for (const candidate of candidates) {
    const value = unwrap(candidate);
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  }
  return {};
}

function explicitQualityPass(evidence = {}) {
  if (evidence.passed === true) return true;
  if (evidence.approved === true) return true;
  if (evidence.release_readiness === true) return true;
  const verdict = text(
    evidence.verdict || evidence.status || evidence.result || evidence.decision,
  ).toUpperCase();
  return ["PASS", "PASSED", "APPROVED", "READY", "RELEASE_READY"].includes(verdict);
}

function qualityFailures(evidence = {}) {
  return [
    ...list(evidence.failed_checks),
    ...list(evidence.failures),
    ...list(evidence.critical_failures),
    ...list(evidence.issues).map((issue) =>
      typeof issue === "string"
        ? issue
        : issue?.message || issue?.issue || issue?.failure,
    ),
  ].filter(Boolean).map(String);
}

function repairInstructions(evidence = {}) {
  return [...new Set([
    ...list(evidence.repair_instructions),
    ...list(evidence.correction_instructions),
    ...list(evidence.recommendations),
    ...list(evidence.issues).map((issue) =>
      typeof issue === "object" ? issue?.correction || issue?.repair : null,
    ),
  ].filter(Boolean).map(String))];
}

function assetTypeFor(workflow) {
  if (workflow === "STILL") return CREATIVE_ASSET_NODE_TYPES.IMAGE;
  if (workflow === "AUDIO") return CREATIVE_ASSET_NODE_TYPES.AUDIO;
  return CREATIVE_ASSET_NODE_TYPES.ASSET;
}

function taskIdentity(task = {}) {
  return {
    id: task.id,
    status: task.status,
    updated_at: task.updated_at || null,
    deliverable_id: task.metadata?.deliverable_id || null,
    production_step_id: task.metadata?.production_step_id || null,
    output_url: resolvedUrl(task.output || {}),
    output: meaningfulPayload(task),
  };
}

function finalisationIdentity(project, workflow, tasks) {
  return crypto.createHash("sha256").update(JSON.stringify({
    project_id: project.id,
    project_updated_at: project.updated_at || null,
    workflow,
    tasks: tasks.map(taskIdentity),
  })).digest("hex");
}

async function createOrReuse(node, metadataKey, metadataValue) {
  return AssetGraphRepository.createOrFindByMetadataIdentity({
    node,
    metadata_key: metadataKey,
    metadata_value: metadataValue,
  });
}

function groupByDeliverable(tasks = []) {
  const groups = new Map();
  for (const task of tasks) {
    const id = text(task.metadata?.deliverable_id);
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(task);
  }
  return groups;
}

function isQualityTask(task = {}) {
  return task.type === "QUALITY_REVIEW" || task.metadata?.quality_gate === true;
}

function releaseCandidateTask(tasks = []) {
  return tasks
    .filter((task) => !isQualityTask(task))
    .filter((task) => task.status === "COMPLETED")
    .sort((left, right) =>
      Number(right.metadata?.production_step_index || 0) -
      Number(left.metadata?.production_step_index || 0),
    )[0] || null;
}

function qualityTask(tasks = []) {
  return tasks
    .filter(isQualityTask)
    .sort((left, right) =>
      Number(right.metadata?.production_step_index || 0) -
      Number(left.metadata?.production_step_index || 0),
    )[0] || null;
}

export const CreativeUniversalFinalisationRuntime = {
  async run({ organization_id, creative_project_id } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const [project, tasks] = await Promise.all([
      CreativeProjectRepository.getById(creative_project_id),
      ProductionTaskRuntime.list({ organization_id, creative_project_id }),
    ]);
    if (!project || project.organization_id !== organization_id) {
      throw new Error("Creative project not found");
    }

    const workflow = workflowKind(project, tasks);
    if (!UNIVERSAL_WORKFLOWS.has(workflow)) {
      throw new Error(`CREATIVE_UNIVERSAL_FINALISATION_WORKFLOW_REQUIRED:${workflow || "UNKNOWN"}`);
    }

    const failedTasks = tasks.filter((task) => ["FAILED", "SKIPPED"].includes(task.status));
    const incompleteTasks = tasks.filter((task) => task.status !== "COMPLETED");
    if (failedTasks.length) {
      return {
        success: false,
        passed: false,
        status: "BLOCKED_BY_PRODUCTION_FAILURE",
        workflow_kind: workflow,
        failed_task_ids: failedTasks.map((task) => task.id),
      };
    }
    if (!tasks.length || incompleteTasks.length) {
      return {
        success: false,
        passed: false,
        status: "AWAITING_PRODUCTION",
        workflow_kind: workflow,
        incomplete_task_ids: incompleteTasks.map((task) => task.id),
      };
    }

    const groups = groupByDeliverable(tasks);
    if (!groups.size) {
      throw new Error("CREATIVE_UNIVERSAL_DELIVERABLE_TASKS_REQUIRED");
    }

    const identity = finalisationIdentity(project, workflow, tasks);
    const deliverables = [];
    const blockers = [];

    for (const [deliverableId, deliverableTasks] of groups.entries()) {
      const candidateTask = releaseCandidateTask(deliverableTasks);
      const reviewTask = qualityTask(deliverableTasks);
      const payload = candidateTask ? meaningfulPayload(candidateTask) : null;
      const url = candidateTask ? resolvedUrl(candidateTask.output || {}) : null;
      const review = reviewTask ? qualityEvidence(reviewTask) : {};
      const outputPresent = Boolean(candidateTask && (url || payload));
      const reviewPresent = Boolean(reviewTask && Object.keys(review).length);
      const qualityPassed = reviewPresent && explicitQualityPass(review);
      const failures = qualityFailures(review);
      const repairs = repairInstructions(review);

      if (!outputPresent) blockers.push(`${deliverableId}:FINAL_OUTPUT_REQUIRED`);
      if (!reviewTask) blockers.push(`${deliverableId}:QUALITY_REVIEW_REQUIRED`);
      if (reviewTask && !reviewPresent) blockers.push(`${deliverableId}:QUALITY_EVIDENCE_REQUIRED`);
      if (reviewPresent && !qualityPassed) blockers.push(`${deliverableId}:QUALITY_REJECTED`);

      let candidateNode = null;
      if (candidateTask && outputPresent) {
        const candidateIdentity = `${identity}:${deliverableId}:candidate`;
        const result = await createOrReuse(createCreativeAssetNode({
          organization_id,
          creative_project_id,
          production_task_id: candidateTask.id,
          type: assetTypeFor(workflow),
          status: qualityPassed
            ? CREATIVE_ASSET_NODE_STATUS.REVIEW
            : CREATIVE_ASSET_NODE_STATUS.GENERATED,
          name: candidateTask.title || deliverableId,
          description: candidateTask.description || "Universal Creative release candidate.",
          url,
          lineage: {
            source: "universal_finalisation",
            provider_id: candidateTask.provider_id || candidateTask.output?.provider || null,
            capability: candidateTask.capability || candidateTask.service_code || null,
            generation_version: 1,
          },
          review: {
            ai_reviewed: qualityPassed,
            human_reviewed: false,
            approved: false,
            notes: qualityPassed
              ? "AI quality evidence passed; authenticated human release remains separate."
              : "Release candidate is not quality-approved.",
          },
          metadata: {
            universal_finalisation_identity: candidateIdentity,
            finalisation_identity: identity,
            workflow_kind: workflow,
            deliverable_id: deliverableId,
            source_task_id: candidateTask.id,
            output_payload: payload,
            quality_passed: qualityPassed,
            release_candidate: true,
          },
        }), "universal_finalisation_identity", candidateIdentity);
        candidateNode = result.node;
      }

      let qualityNode = null;
      if (reviewTask) {
        const qualityIdentity = `${identity}:${deliverableId}:quality`;
        const result = await createOrReuse(createCreativeAssetNode({
          organization_id,
          creative_project_id,
          production_task_id: reviewTask.id,
          parent_asset_node_id: candidateNode?.id || null,
          type: CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT,
          status: qualityPassed
            ? CREATIVE_ASSET_NODE_STATUS.APPROVED
            : CREATIVE_ASSET_NODE_STATUS.REJECTED,
          name: `${deliverableId} quality review`,
          description: "Medium-specific quality evidence for a universal Creative deliverable.",
          lineage: {
            source: "universal_quality_review",
            provider_id: reviewTask.provider_id || reviewTask.output?.provider || null,
            capability: reviewTask.capability || reviewTask.service_code || null,
            generation_version: 1,
          },
          intelligence: {
            quality_score: Number(review.overall_score ?? review.score ?? 0),
            safety_status: qualityPassed ? "REVIEW_REQUIRED" : "BLOCKED",
            tags: ["universal-quality", workflow.toLowerCase()],
          },
          review: {
            ai_reviewed: true,
            human_reviewed: false,
            approved: qualityPassed,
            notes: failures.join("\n"),
          },
          metadata: {
            universal_finalisation_identity: qualityIdentity,
            finalisation_identity: identity,
            workflow_kind: workflow,
            deliverable_id: deliverableId,
            source_task_id: reviewTask.id,
            passed: qualityPassed,
            evidence: review,
            failures,
            repair_instructions: repairs,
          },
        }), "universal_finalisation_identity", qualityIdentity);
        qualityNode = result.node;
      }

      let repairNode = null;
      if (!qualityPassed) {
        const repairIdentity = `${identity}:${deliverableId}:repair`;
        const result = await createOrReuse(createCreativeAssetNode({
          organization_id,
          creative_project_id,
          parent_asset_node_id: candidateNode?.id || qualityNode?.id || null,
          type: CREATIVE_ASSET_NODE_TYPES.REPAIR_PLAN,
          status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
          name: `${deliverableId} repair plan`,
          description: "Bounded repair instructions produced from failed or incomplete quality evidence.",
          lineage: {
            source: "universal_finalisation_repair",
            capability: "creative.universal.finalisation.repair",
            generation_version: 1,
          },
          review: {
            ai_reviewed: true,
            human_reviewed: false,
            approved: false,
            notes: repairs.join("\n"),
          },
          metadata: {
            universal_finalisation_identity: repairIdentity,
            finalisation_identity: identity,
            workflow_kind: workflow,
            deliverable_id: deliverableId,
            failures: failures.length ? failures : ["EXPLICIT_QUALITY_PASS_REQUIRED"],
            repair_instructions: repairs,
            automatic_execution_allowed: false,
          },
        }), "universal_finalisation_identity", repairIdentity);
        repairNode = result.node;
      }

      deliverables.push({
        deliverable_id: deliverableId,
        output_present: outputPresent,
        quality_evidence_present: reviewPresent,
        quality_passed: qualityPassed,
        candidate_asset_node_id: candidateNode?.id || null,
        quality_report_asset_node_id: qualityNode?.id || null,
        repair_plan_asset_node_id: repairNode?.id || null,
        source_task_id: candidateTask?.id || null,
        quality_task_id: reviewTask?.id || null,
        url,
      });
    }

    const passed = blockers.length === 0 && deliverables.length > 0;
    const readinessIdentity = `${identity}:readiness`;
    const readinessResult = await createOrReuse(createCreativeAssetNode({
      organization_id,
      creative_project_id,
      type: CREATIVE_ASSET_NODE_TYPES.RELEASE_READINESS_REPORT,
      status: passed
        ? CREATIVE_ASSET_NODE_STATUS.REVIEW
        : CREATIVE_ASSET_NODE_STATUS.REJECTED,
      name: `${project.name || "Creative project"} universal release readiness`,
      description: "Universal release-readiness evidence across real outputs, medium-specific quality reviews and repair blockers.",
      lineage: {
        source: "universal_release_readiness",
        capability: "creative.universal.finalisation.evaluate",
        generation_version: 1,
      },
      intelligence: {
        safety_status: passed ? "REVIEW_REQUIRED" : "BLOCKED",
        tags: ["release-readiness", "universal", workflow.toLowerCase()],
      },
      review: {
        ai_reviewed: true,
        human_reviewed: false,
        approved: false,
        notes: passed
          ? "All universal output and quality checks passed; authenticated human release remains required by policy."
          : blockers.join("\n"),
      },
      metadata: {
        universal_finalisation_identity: readinessIdentity,
        finalisation_identity: identity,
        workflow_kind: workflow,
        passed,
        blockers,
        deliverables,
        evaluated_at: new Date().toISOString(),
      },
    }), "universal_finalisation_identity", readinessIdentity);

    const stateInput = {
      organization_id,
      creative_project_id,
      creative_mission_id: project.creative_mission_id,
    };
    await CreativeStateEngine.set(stateInput, PIPELINE_STAGES.REVIEWING);
    await CreativeProjectRepository.update(creative_project_id, {
      status: "QUALITY",
      metadata: {
        ...(project.metadata || {}),
        workflow_kind: workflow,
        universal_finalisation: {
          identity,
          status: passed ? "READY_FOR_APPROVAL" : "REVIEW_REQUIRED",
          passed,
          blockers,
          deliverables,
          release_readiness_asset_node_id: readinessResult.node.id,
          evaluated_at: new Date().toISOString(),
        },
      },
    });

    return {
      success: passed,
      passed,
      status: passed ? "READY_FOR_APPROVAL" : "REVIEW_REQUIRED",
      workflow_kind: workflow,
      blockers,
      deliverables,
      release_readiness: readinessResult.node,
    };
  },
};