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
    const next = current.output || current.result || current.json || current.data;
    if (!next || next === current) break;
    current = next;
  }
  return current;
}

function outputSources(task = {}) {
  return [
    task.output?.output,
    task.output?.result,
    task.output?.provider_submission?.output,
    task.output?.provider_submission,
    task.output,
  ].filter(Boolean);
}

function resolvedUrl(task = {}) {
  for (const source of outputSources(task)) {
    const value = unwrap(source);
    const url =
      value?.url ||
      value?.file_url ||
      value?.fileUrl ||
      value?.image_url ||
      value?.imageUrl ||
      value?.video_url ||
      value?.videoUrl ||
      value?.audio_url ||
      value?.audioUrl ||
      value?.deployment_url ||
      value?.preview_url ||
      value?.download_url ||
      value?.build_artifact_url ||
      value?.package_url ||
      value?.files?.[0]?.url;
    if (url) return url;
  }
  return null;
}

function meaningfulPayload(task = {}) {
  for (const source of outputSources(task)) {
    const value = unwrap(source);
    if (typeof value === "string" && text(value)) return value;
    if (Array.isArray(value) && value.length) return value;
    if (value && typeof value === "object") {
      const keys = Object.keys(value).filter((key) => ![
        "usage",
        "pricing",
        "billing",
        "settlement",
        "provider",
        "model",
        "provider_job_id",
        "provider_status",
        "credential_id",
      ].includes(key));
      if (keys.length) return value;
    }
  }
  return null;
}

function artifactEvidence(task = {}) {
  for (const source of outputSources(task)) {
    const value = unwrap(source);
    if (!value || typeof value !== "object") continue;
    if (
      value.storage_path ||
      value.artifact_id ||
      value.build_id ||
      value.deployment_id ||
      value.package_id ||
      value.checksum ||
      value.files?.length
    ) {
      return value;
    }
  }
  return null;
}

function realOutputPresent(workflow, task) {
  const url = resolvedUrl(task);
  const artifact = artifactEvidence(task);
  const deliverableType = text(task.metadata?.deliverable_type).toUpperCase();
  const media = ["STILL", "AUDIO"].includes(workflow) ||
    ["IMAGE", "POSTER", "BANNER", "KEY_ART", "AUDIO", "VOICE", "MUSIC", "PODCAST"].includes(deliverableType);
  if (media) return Boolean(url);
  if (["DOCUMENT", "INTERACTIVE", "SOFTWARE"].includes(workflow)) {
    return Boolean(url || artifact);
  }
  if (workflow === "CAMPAIGN_SYSTEM") {
    return Boolean(url || artifact);
  }
  return false;
}

function qualityEvidence(task = {}) {
  for (const source of outputSources(task)) {
    const value = unwrap(source);
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  }
  return {};
}

function explicitQualityPass(evidence = {}) {
  if (evidence.passed === true || evidence.approved === true || evidence.release_readiness === true) {
    return true;
  }
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
      typeof issue === "string" ? issue : issue?.message || issue?.issue || issue?.failure,
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

function deterministicUuid(value) {
  const hash = crypto.createHash("sha256").update(value).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

async function createOrReuse(node, identity) {
  return AssetGraphRepository.createOrFindByMetadataIdentity({
    node: { ...node, id: deterministicUuid(identity) },
    metadata_key: "universal_finalisation_identity",
    metadata_value: identity,
  });
}

function isQualityTask(task = {}) {
  return task.type === "QUALITY_REVIEW" || task.metadata?.quality_gate === true;
}

function groupedDeliverables(tasks = []) {
  const groups = new Map();
  for (const task of tasks) {
    const id = text(task.metadata?.deliverable_id);
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(task);
  }
  return groups;
}

function latestTask(tasks, predicate) {
  return tasks
    .filter(predicate)
    .sort((left, right) =>
      Number(right.metadata?.production_step_index || 0) -
      Number(left.metadata?.production_step_index || 0),
    )[0] || null;
}

function finalisationIdentity(project, workflow, tasks) {
  return crypto.createHash("sha256").update(JSON.stringify({
    project_id: project.id,
    workflow,
    tasks: tasks.map((task) => ({
      id: task.id,
      status: task.status,
      updated_at: task.updated_at || null,
      deliverable_id: task.metadata?.deliverable_id || null,
      production_step_id: task.metadata?.production_step_id || null,
      output_url: resolvedUrl(task),
      output: meaningfulPayload(task),
    })),
  })).digest("hex");
}

function assetTypeFor(workflow) {
  if (workflow === "STILL") return CREATIVE_ASSET_NODE_TYPES.IMAGE;
  if (workflow === "AUDIO") return CREATIVE_ASSET_NODE_TYPES.AUDIO;
  return CREATIVE_ASSET_NODE_TYPES.ASSET;
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

    const groups = groupedDeliverables(tasks);
    if (!groups.size) throw new Error("CREATIVE_UNIVERSAL_DELIVERABLE_TASKS_REQUIRED");

    const identity = finalisationIdentity(project, workflow, tasks);
    const blockers = [];
    const deliverables = [];

    for (const [deliverableId, deliverableTasks] of groups.entries()) {
      const candidateTask = latestTask(
        deliverableTasks,
        (task) => !isQualityTask(task) && task.status === "COMPLETED",
      );
      const reviewTask = latestTask(deliverableTasks, isQualityTask);
      const review = reviewTask ? qualityEvidence(reviewTask) : {};
      const outputPresent = Boolean(candidateTask && realOutputPresent(workflow, candidateTask));
      const reviewPresent = Boolean(reviewTask && Object.keys(review).length);
      const qualityPassed = reviewPresent && explicitQualityPass(review);
      const failures = qualityFailures(review);
      const repairs = repairInstructions(review);

      if (!outputPresent) blockers.push(`${deliverableId}:REAL_ARTIFACT_REQUIRED`);
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
          url: resolvedUrl(candidateTask),
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
              ? "AI quality passed; authenticated human release remains separate."
              : "Release candidate is not quality-approved.",
          },
          metadata: {
            universal_finalisation_identity: candidateIdentity,
            finalisation_identity: identity,
            workflow_kind: workflow,
            deliverable_id: deliverableId,
            source_task_id: candidateTask.id,
            output_payload: meaningfulPayload(candidateTask),
            artifact_evidence: artifactEvidence(candidateTask),
            quality_passed: qualityPassed,
            release_candidate: true,
          },
        }), candidateIdentity);
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
        }), qualityIdentity);
        qualityNode = result.node;
      }

      let repairNode = null;
      if (!outputPresent || !qualityPassed) {
        const repairIdentity = `${identity}:${deliverableId}:repair`;
        const result = await createOrReuse(createCreativeAssetNode({
          organization_id,
          creative_project_id,
          parent_asset_node_id: candidateNode?.id || qualityNode?.id || null,
          type: CREATIVE_ASSET_NODE_TYPES.REPAIR_PLAN,
          status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
          name: `${deliverableId} repair plan`,
          description: "Bounded repair instructions from missing artifact or failed quality evidence.",
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
            failures: [
              ...(!outputPresent ? ["REAL_ARTIFACT_REQUIRED"] : []),
              ...(failures.length ? failures : !qualityPassed ? ["EXPLICIT_QUALITY_PASS_REQUIRED"] : []),
            ],
            repair_instructions: repairs,
            automatic_execution_allowed: false,
          },
        }), repairIdentity);
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
        url: candidateTask ? resolvedUrl(candidateTask) : null,
      });
    }

    let campaignCoherence = null;
    if (workflow === "CAMPAIGN_SYSTEM") {
      const coherenceTask = latestTask(
        tasks.filter((task) => !text(task.metadata?.deliverable_id)),
        isQualityTask,
      );
      const evidence = coherenceTask ? qualityEvidence(coherenceTask) : {};
      const evidencePresent = Boolean(coherenceTask && Object.keys(evidence).length);
      const passed = evidencePresent && explicitQualityPass(evidence);
      if (!coherenceTask) blockers.push("CAMPAIGN_SYSTEM:COHERENCE_REVIEW_REQUIRED");
      if (coherenceTask && !evidencePresent) blockers.push("CAMPAIGN_SYSTEM:COHERENCE_EVIDENCE_REQUIRED");
      if (evidencePresent && !passed) blockers.push("CAMPAIGN_SYSTEM:COHERENCE_REJECTED");
      campaignCoherence = {
        quality_task_id: coherenceTask?.id || null,
        evidence_present: evidencePresent,
        passed,
        evidence,
      };
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
      description: "Universal release-readiness evidence across real artifacts, quality reviews and repair blockers.",
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
          ? "All universal artifact and quality checks passed; authenticated human release remains required by policy."
          : blockers.join("\n"),
      },
      metadata: {
        universal_finalisation_identity: readinessIdentity,
        finalisation_identity: identity,
        workflow_kind: workflow,
        passed,
        blockers,
        deliverables,
        campaign_coherence: campaignCoherence,
        evaluated_at: new Date().toISOString(),
      },
    }), readinessIdentity);

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
          campaign_coherence: campaignCoherence,
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
      campaign_coherence: campaignCoherence,
      release_readiness: readinessResult.node,
    };
  },
};