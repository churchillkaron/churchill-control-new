import {
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

const CONTRACT = "CREATIVE_VIDEO_STUDIO_ORCHESTRATION_V1";

const PHASES = Object.freeze([
  { id: "production", label: "Production", workspace: "production" },
  { id: "edit", label: "Edit", workspace: "timeline" },
  { id: "mastering", label: "Mastering", workspace: "render" },
  { id: "release", label: "Release", workspace: "publishing" },
]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function timestamp(node = {}) {
  return Date.parse(node.updated_at || node.created_at || 0) || 0;
}

function newest(nodes = [], predicate = () => true) {
  return [...nodes]
    .filter(predicate)
    .sort((left, right) => timestamp(right) - timestamp(left))[0] || null;
}

function normalizeStatus(value) {
  return text(value).toUpperCase();
}

function subjectIdentity(subject) {
  return (
    subject?.metadata?.render_identity ||
    subject?.metadata?.release_readiness_identity ||
    subject?.metadata?.release_gate_identity ||
    subject?.metadata?.dossier_hash ||
    null
  );
}

function currentApproval(nodes, subject, scope) {
  if (!subject?.id) return null;
  const identity = subjectIdentity(subject);
  return newest(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.APPROVAL_RECORD &&
    node.status === CREATIVE_ASSET_NODE_STATUS.APPROVED &&
    node.parent_asset_node_id === subject.id &&
    node.metadata?.subject_asset_node_id === subject.id &&
    node.metadata?.subject_updated_at === (subject.updated_at || null) &&
    node.metadata?.subject_identity === identity &&
    node.metadata?.scope === scope &&
    node.metadata?.approver_user_id &&
    node.metadata?.approver_staff_account_id,
  );
}

function targetId(target = {}) {
  return text(target.id || target.key || target.channel || target.provider);
}

function targetValid(target = {}) {
  const status = normalizeStatus(target.status);
  return Boolean(
    targetId(target) &&
    target.enabled !== false &&
    !["DISABLED", "INACTIVE", "SUSPENDED"].includes(status) &&
    text(target.service_id) &&
    text(target.provider_id || target.provider || target.connector),
  );
}

function commandForTarget(nodes, readiness, target) {
  if (!readiness?.id) return null;
  const id = targetId(target);
  return newest(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.PUBLISH_COMMAND &&
    node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED &&
    text(node.metadata?.release_readiness_report_id) === text(readiness.id) &&
    text(node.metadata?.publish_target_id) === id,
  );
}

function executionForCommand(nodes, command) {
  if (!command?.id) return null;
  return newest(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.PUBLISH_EXECUTION &&
    node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED &&
    (
      node.parent_asset_node_id === command.id ||
      node.metadata?.publish_command_asset_node_id === command.id
    ),
  );
}

function externalEvidence(command, execution) {
  return Boolean(
    execution?.metadata?.external_publication_id ||
    execution?.metadata?.external_publication_url ||
    command?.metadata?.external_publication_id ||
    command?.metadata?.external_publication_url,
  );
}

function phase(id, status, detail, evidence = {}) {
  const definition = PHASES.find((item) => item.id === id);
  return {
    ...definition,
    status,
    detail,
    evidence,
  };
}

function productionPhase(tasks = []) {
  const statuses = tasks.map((task) => normalizeStatus(task.status));
  const failed = tasks.filter((task) =>
    ["FAILED", "SKIPPED"].includes(normalizeStatus(task.status)),
  );
  const incomplete = tasks.filter((task) =>
    normalizeStatus(task.status) !== "COMPLETED",
  );
  const running = tasks.filter((task) =>
    ["RUNNING", "PROCESSING", "IN_PROGRESS", "EXECUTING"].includes(
      normalizeStatus(task.status),
    ),
  );
  const review = tasks.filter((task) =>
    ["REVIEW", "WAITING_REVIEW", "READY_FOR_REVIEW"].includes(
      normalizeStatus(task.status),
    ),
  );

  if (!tasks.length) {
    return phase(
      "production",
      "NOT_STARTED",
      "No governed production tasks exist yet.",
      { task_count: 0 },
    );
  }
  if (failed.length) {
    return phase(
      "production",
      "NEEDS_ATTENTION",
      `${failed.length} production task${failed.length === 1 ? "" : "s"} require attention.`,
      {
        task_count: tasks.length,
        failed_count: failed.length,
        incomplete_count: incomplete.length,
        running_count: running.length,
        review_count: review.length,
        statuses,
      },
    );
  }
  if (incomplete.length) {
    return phase(
      "production",
      "IN_PROGRESS",
      `${tasks.length - incomplete.length}/${tasks.length} production tasks settled.`,
      {
        task_count: tasks.length,
        incomplete_count: incomplete.length,
        running_count: running.length,
        review_count: review.length,
        statuses,
      },
    );
  }
  return phase(
    "production",
    "COMPLETE",
    `All ${tasks.length} production tasks are settled.`,
    { task_count: tasks.length, completed_count: tasks.length, statuses },
  );
}

function editPhase(production, timeline) {
  if (!timeline) {
    return production.status === "COMPLETE"
      ? phase("edit", "READY", "Production is settled. The edit desk is ready.")
      : phase("edit", "BLOCKED", "Edit remains downstream of settled production evidence.");
  }

  const missing = list(timeline.metadata?.missing_requirements);
  const clips = list(timeline.metadata?.edit_decision_list);
  const rejected = timeline.status === CREATIVE_ASSET_NODE_STATUS.REJECTED;
  if (rejected || missing.length || !clips.length) {
    return phase(
      "edit",
      "NEEDS_ATTENTION",
      rejected
        ? "The current edit was rejected."
        : missing.length
          ? `${missing.length} edit requirement${missing.length === 1 ? " is" : "s are"} unresolved.`
          : "The current edit contains no governed clips.",
      {
        timeline_asset_node_id: timeline.id,
        clip_count: clips.length,
        missing_requirement_count: missing.length,
        timeline_status: timeline.status,
      },
    );
  }

  if (production.status !== "COMPLETE") {
    return phase(
      "edit",
      "IN_PROGRESS",
      "A governed cut exists, but production is still settling.",
      {
        timeline_asset_node_id: timeline.id,
        clip_count: clips.length,
        missing_requirement_count: 0,
      },
    );
  }

  return phase(
    "edit",
    "COMPLETE",
    `${clips.length} governed clip${clips.length === 1 ? "" : "s"} form the active edit.`,
    {
      timeline_asset_node_id: timeline.id,
      clip_count: clips.length,
      duration_seconds:
        Number(timeline.metadata?.total_duration_seconds || timeline.technical?.duration_seconds || 0) || null,
      timeline_identity: timeline.metadata?.timeline_identity || null,
    },
  );
}

function masteringPhase(production, edit, render, readiness, renderApproval) {
  if (production.status !== "COMPLETE" || edit.status !== "COMPLETE") {
    return phase(
      "mastering",
      "BLOCKED",
      "Mastering opens only after production and the active edit are settled.",
    );
  }
  if (!render) {
    return phase("mastering", "READY", "The active edit is ready to build into a governed master.");
  }

  const technicalPassed = render.metadata?.technical_qc?.passed === true;
  if (
    render.status === CREATIVE_ASSET_NODE_STATUS.REJECTED ||
    !technicalPassed
  ) {
    return phase(
      "mastering",
      "NEEDS_ATTENTION",
      "The current master does not have passing technical QC.",
      {
        final_render_asset_node_id: render.id,
        technical_qc_passed: technicalPassed,
        render_status: render.status,
      },
    );
  }

  if (!readiness) {
    return phase(
      "mastering",
      "IN_PROGRESS",
      "The master exists and passed technical QC; release readiness still needs evidence.",
      {
        final_render_asset_node_id: render.id,
        technical_qc_passed: true,
      },
    );
  }

  if (readiness.metadata?.passed !== true) {
    return phase(
      "mastering",
      "NEEDS_ATTENTION",
      "Release readiness is blocked by unresolved master evidence.",
      {
        final_render_asset_node_id: render.id,
        release_readiness_report_id: readiness.id,
        failed_checks: list(readiness.metadata?.failed_checks),
      },
    );
  }

  if (!renderApproval) {
    return phase(
      "mastering",
      "WAITING_APPROVAL",
      "The master passed release readiness and is waiting for final human approval.",
      {
        final_render_asset_node_id: render.id,
        release_readiness_report_id: readiness.id,
      },
    );
  }

  return phase(
    "mastering",
    "COMPLETE",
    "Final master approval and release-readiness evidence are current.",
    {
      final_render_asset_node_id: render.id,
      final_render_approval_record_id: renderApproval.id,
      release_readiness_report_id: readiness.id,
      release_readiness_identity:
        readiness.metadata?.release_readiness_identity || null,
    },
  );
}

function releasePhase(mastering, readiness, publishApproval, targets, nodes) {
  if (mastering.status !== "COMPLETE") {
    return phase(
      "release",
      "BLOCKED",
      "Release remains locked until the approved final master is current.",
    );
  }

  if (!publishApproval) {
    return phase(
      "release",
      "WAITING_APPROVAL",
      "Publication requires a separate authenticated release approval.",
      {
        release_readiness_report_id: readiness?.id || null,
      },
    );
  }

  if (!targets.length) {
    return phase(
      "release",
      "NEEDS_ATTENTION",
      "No governed publish targets are configured for this project.",
      {
        publish_approval_record_id: publishApproval.id,
        target_count: 0,
      },
    );
  }

  const targetStates = targets.map((target) => {
    const command = commandForTarget(nodes, readiness, target);
    const execution = executionForCommand(nodes, command);
    const state =
      normalizeStatus(execution?.metadata?.execution_status) ||
      normalizeStatus(command?.metadata?.execution_status) ||
      "NOT_AUTHORIZED";
    return {
      id: targetId(target),
      channel: target.channel || null,
      name: target.name || null,
      configuration_valid: targetValid(target),
      command_asset_node_id: command?.id || null,
      execution_asset_node_id: execution?.id || null,
      state,
      external_evidence: externalEvidence(command, execution),
      error:
        execution?.metadata?.error ||
        command?.metadata?.publication_error ||
        null,
    };
  });

  const invalid = targetStates.filter((target) => !target.configuration_valid);
  const failed = targetStates.filter((target) =>
    ["FAILED", "EVIDENCE_REQUIRED"].includes(target.state),
  );
  const pending = targetStates.filter((target) =>
    ["DISPATCHING", "PENDING_PROVIDER"].includes(target.state),
  );
  const actionable = targetStates.filter((target) =>
    ["NOT_AUTHORIZED", "PENDING_CONNECTOR"].includes(target.state),
  );
  const completed = targetStates.filter((target) =>
    target.state === "COMPLETED" && target.external_evidence,
  );

  const evidence = {
    release_readiness_report_id: readiness?.id || null,
    publish_approval_record_id: publishApproval.id,
    target_count: targetStates.length,
    completed_count: completed.length,
    pending_count: pending.length,
    actionable_count: actionable.length,
    failed_count: failed.length,
    invalid_count: invalid.length,
    targets: targetStates,
  };

  if (invalid.length || failed.length) {
    return phase(
      "release",
      "NEEDS_ATTENTION",
      `${invalid.length + failed.length} release destination${invalid.length + failed.length === 1 ? " needs" : "s need"} attention.`,
      evidence,
    );
  }
  if (pending.length) {
    return phase(
      "release",
      "IN_PROGRESS",
      `${pending.length} provider delivery${pending.length === 1 ? " is" : "ies are"} awaiting external confirmation.`,
      evidence,
    );
  }
  if (actionable.length) {
    return phase(
      "release",
      "READY",
      `${actionable.length} release destination${actionable.length === 1 ? " is" : "s are"} ready for the next governed action.`,
      evidence,
    );
  }
  if (completed.length === targetStates.length) {
    return phase(
      "release",
      "COMPLETE",
      `External delivery evidence is verified for all ${completed.length} release destinations.`,
      evidence,
    );
  }

  return phase(
    "release",
    "NEEDS_ATTENTION",
    "Release state is incomplete and requires operator review.",
    evidence,
  );
}

function nextAction(phases = []) {
  const production = phases.find((item) => item.id === "production");
  const edit = phases.find((item) => item.id === "edit");
  const mastering = phases.find((item) => item.id === "mastering");
  const release = phases.find((item) => item.id === "release");

  if (production?.status !== "COMPLETE") {
    return {
      workspace: "production",
      phase: "production",
      label:
        production?.status === "NEEDS_ATTENTION"
          ? "Resolve production exceptions"
          : production?.status === "NOT_STARTED"
            ? "Prepare production"
            : "Continue production",
      reason: production?.detail || "Production requires attention.",
    };
  }

  if (edit?.status !== "COMPLETE") {
    return {
      workspace: "timeline",
      phase: "edit",
      label:
        edit?.status === "NEEDS_ATTENTION"
          ? "Resolve edit blockers"
          : "Open edit desk",
      reason: edit?.detail || "The edit is the next governed step.",
    };
  }

  if (mastering?.status !== "COMPLETE") {
    const labels = {
      READY: "Build master",
      WAITING_APPROVAL: "Approve final master",
      NEEDS_ATTENTION: "Resolve mastering blockers",
      IN_PROGRESS: "Run release audit",
    };
    return {
      workspace: "render",
      phase: "mastering",
      label: labels[mastering?.status] || "Review mastering",
      reason: mastering?.detail || "Mastering is the next governed step.",
    };
  }

  if (release?.status !== "COMPLETE") {
    let label = "Open release desk";
    if (release?.status === "WAITING_APPROVAL") label = "Approve publication";
    if (release?.status === "NEEDS_ATTENTION") label = "Resolve release blockers";
    if (release?.status === "IN_PROGRESS") label = "Check provider delivery";
    if (release?.status === "READY") {
      const targets = list(release?.evidence?.targets);
      label = targets.some((target) => target.state === "NOT_AUTHORIZED")
        ? "Authorize delivery target"
        : "Execute delivery";
    }
    return {
      workspace: "publishing",
      phase: "release",
      label,
      reason: release?.detail || "Release is the next governed step.",
    };
  }

  return {
    workspace: "learning",
    phase: "complete",
    label: "Review release outcomes",
    reason: "The film is externally delivered with verified publication evidence.",
  };
}

export const CreativeVideoStudioOrchestrationRuntime = Object.freeze({
  contract: CONTRACT,

  async inspect({ organization_id, creative_project_id } = {}) {
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

    const timeline = newest(nodes, (node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.TIMELINE &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    );
    const render = newest(nodes, (node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED &&
      (
        !timeline ||
        node.parent_asset_node_id === timeline.id ||
        node.metadata?.timeline_asset_node_id === timeline.id
      ),
    );
    const readiness = newest(nodes, (node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_READINESS_REPORT &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED &&
      (
        !render ||
        node.parent_asset_node_id === render.id ||
        node.metadata?.final_render_asset_node_id === render.id
      ),
    );
    const renderApproval = currentApproval(nodes, render, "FINAL_RENDER");
    const publishApproval = currentApproval(nodes, readiness, "PUBLISH_RELEASE");
    const targets = list(project.metadata?.publish_targets)
      .filter((target) => target && typeof target === "object" && targetId(target));

    const production = productionPhase(list(tasks));
    const edit = editPhase(production, timeline);
    const mastering = masteringPhase(
      production,
      edit,
      render,
      readiness,
      renderApproval,
    );
    const release = releasePhase(
      mastering,
      readiness,
      publishApproval,
      targets,
      nodes,
    );
    const phases = [production, edit, mastering, release];
    const action = nextAction(phases);
    const completed = phases.filter((item) => item.status === "COMPLETE").length;
    const current = phases.find((item) => item.status !== "COMPLETE") || release;

    return {
      contract: CONTRACT,
      inspected_at: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.name || project.title || "Creative project",
      },
      phases,
      current_phase: current?.id || "release",
      current_phase_label: current?.label || "Release",
      next_action: action,
      progress: {
        completed_count: completed,
        total_count: phases.length,
        percent: Math.round((completed / phases.length) * 100),
      },
      evidence: {
        timeline_asset_node_id: timeline?.id || null,
        final_render_asset_node_id: render?.id || null,
        final_render_approval_record_id: renderApproval?.id || null,
        release_readiness_report_id: readiness?.id || null,
        release_readiness_passed: readiness?.metadata?.passed === true,
        publish_approval_record_id: publishApproval?.id || null,
      },
      externally_delivered: release.status === "COMPLETE",
    };
  },
});
