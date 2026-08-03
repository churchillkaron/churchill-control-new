#!/usr/bin/env node

import process from "node:process";

import {
  loadAvantiqoEnv,
} from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

await import("./creative-runtime-bootstrap.mjs");
await import(
  "@/lib/creative/production/dossier/runtime/CreativeProductionDossierExecutionGate"
);

const [
  { CreativeApprovalRuntime },
  AssetGraphRepository,
  ProductionGraphRepository,
  { ProductionTaskRuntime },
  { ProductionQueueRuntime },
  { CreativeFinalisationRouter },
  { CreativeStateEngine, PIPELINE_STAGES },
] = await Promise.all([
  import("@/lib/creative/release/runtime/CreativeApprovalRuntime"),
  import("@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository"),
  import("@/lib/creative/production-graph/repositories/ProductionGraphRepository"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/production/queue/runtime/ProductionQueueRuntime"),
  import("@/lib/creative/finalisation/runtime/CreativeFinalisationRouter"),
  import("@/lib/creative/state/CreativeStateEngine"),
]);

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integer(value, fallback) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function activeRecord(record = {}) {
  const status = text(record.status).toUpperCase();
  return Boolean(
    record.archived !== true &&
    !record.archived_at &&
    !record.superseded_at &&
    !record.metadata?.archived_at &&
    !record.metadata?.superseded_at &&
    !record.metadata?.superseded_by &&
    !["ARCHIVED", "CANCELLED", "CANCELED", "REJECTED", "SUPERSEDED"]
      .includes(status)
  );
}

function closeEnough(left, right, tolerance = 0.000001) {
  return Math.abs(Number(left) - Number(right)) <= tolerance;
}

function taskCost(tasks = [], field = "estimated") {
  return tasks.reduce(
    (sum, task) => sum + Math.max(0, finite(task.cost?.[field]) || 0),
    0,
  );
}

function queueCounts(queue = {}) {
  return {
    waiting: list(queue.waiting).length,
    ready: list(queue.ready).length,
    running: list(queue.running).length,
    review: list(queue.review).length,
    completed: list(queue.completed).length,
    failed: list(queue.failed).length,
    blocked: list(queue.blocked).length,
    superseded: list(queue.superseded).length,
    total: Number(queue.total || 0),
  };
}

function ids(records = []) {
  return list(records).map((record) => record.id).filter(Boolean);
}

function providerJobId(task = {}) {
  return task.output?.provider_job_id ||
    task.output?.provider_submission?.provider_job_id ||
    task.output?.provider_submission?.output?.provider_job_id ||
    task.output?.provider_submission?.output?.output?.provider_job_id ||
    "NONE";
}

function usageId(task = {}) {
  return task.output?.usage?.id ||
    task.output?.provider_submission?.usage?.id ||
    task.output?.provider_poll?.usage?.id ||
    "NONE";
}

function taskFailureSummary(task = {}) {
  return [
    task.id || "NONE",
    text(task.title).replace(/\|/g, "/") || "UNTITLED",
    task.status || "UNKNOWN",
    task.provider_id || task.output?.provider || task.output?.provider_submission?.provider || "NONE",
    providerJobId(task),
    usageId(task),
    task.output?.settlement || task.output?.provider_poll?.settlement || "NONE",
    text(task.error || "NONE").replace(/\s+/g, " ").replace(/\|/g, "/").slice(0, 1000),
  ].join("|");
}

function printQueueFailures(queue = {}) {
  list(queue.failed).forEach((task) =>
    console.error(`FAILED_TASK=${taskFailureSummary(task)}`),
  );
  list(queue.blocked).forEach((task) =>
    console.error(`BLOCKED_TASK=${taskFailureSummary(task)}`),
  );
}

function requiredEnvironment() {
  const values = {
    organizationId: text(process.env.ORGANIZATION_ID),
    missionId: text(
      process.env.CREATIVE_MISSION_ID || process.env.MISSION_ID,
    ),
    projectId: text(
      process.env.CREATIVE_PROJECT_ID || process.env.PROJECT_ID,
    ),
    dossierId: text(process.env.PRODUCTION_DOSSIER_ID),
    graphId: text(process.env.PRODUCTION_GRAPH_ID),
    ceiling: finite(
      process.env.APPROVED_COST_CEILING ||
      process.env.PRODUCTION_BUDGET_CEILING,
    ),
    currency: text(process.env.EXPECTED_CURRENCY).toUpperCase(),
    expectedTaskCount: integer(process.env.EXPECTED_TASK_COUNT, 0),
    pollIntervalMs: integer(process.env.POLL_INTERVAL_MS, 10000),
    maxPollCycles: integer(process.env.MAX_POLL_CYCLES, 720),
    lockWaitMs: integer(process.env.CREATIVE_EXECUTION_LOCK_WAIT_MS, 180000),
    lockRetryMs: integer(process.env.CREATIVE_EXECUTION_LOCK_RETRY_MS, 5000),
  };

  const missing = Object.entries(values)
    .filter(([key, value]) => {
      if (["ceiling", "expectedTaskCount"].includes(key)) {
        return value === null || value <= 0;
      }
      if ([
        "pollIntervalMs",
        "maxPollCycles",
        "lockWaitMs",
        "lockRetryMs",
      ].includes(key)) return false;
      return !value;
    })
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(
      `APPROVED_PRODUCTION_ENVIRONMENT_REQUIRED:${missing.join(",")}`,
    );
  }
  return values;
}

async function verifyImmutableScope(config) {
  const dossier = await AssetGraphRepository.getById(config.dossierId);
  if (
    !dossier ||
    text(dossier.organization_id) !== config.organizationId ||
    text(dossier.creative_project_id) !== config.projectId ||
    text(dossier.type).toUpperCase() !== "PRODUCTION_DOSSIER"
  ) {
    throw new Error("APPROVED_PRODUCTION_DOSSIER_SCOPE_MISMATCH");
  }
  if (!activeRecord(dossier)) {
    throw new Error("APPROVED_PRODUCTION_DOSSIER_NOT_ACTIVE");
  }
  if (text(dossier.metadata?.production_graph_id) !== config.graphId) {
    throw new Error("APPROVED_PRODUCTION_DOSSIER_GRAPH_MISMATCH");
  }
  if (dossier.metadata?.passed !== true) {
    throw new Error("APPROVED_PRODUCTION_DOSSIER_NOT_PASSED");
  }

  const dossierEstimate = finite(dossier.metadata?.estimated_cost);
  const dossierCurrency = text(dossier.metadata?.currency).toUpperCase();
  if (
    dossierEstimate === null ||
    !closeEnough(dossierEstimate, config.ceiling) ||
    dossierCurrency !== config.currency
  ) {
    throw new Error(
      `APPROVED_PRODUCTION_DOSSIER_COST_MISMATCH:` +
      `estimate=${dossierEstimate};ceiling=${config.ceiling};` +
      `currency=${dossierCurrency || "MISSING"}`,
    );
  }

  const graph = await ProductionGraphRepository.getById(config.graphId);
  if (
    !graph ||
    text(graph.organization_id) !== config.organizationId ||
    text(graph.creative_project_id) !== config.projectId ||
    !activeRecord(graph)
  ) {
    throw new Error("APPROVED_PRODUCTION_GRAPH_SCOPE_MISMATCH");
  }
  if (text(graph.metadata?.production_dossier_asset_node_id) !== config.dossierId) {
    throw new Error("APPROVED_PRODUCTION_GRAPH_DOSSIER_MISMATCH");
  }

  const [nodes, graphs, tasks] = await Promise.all([
    AssetGraphRepository.listByProject({
      organization_id: config.organizationId,
      creative_project_id: config.projectId,
    }),
    ProductionGraphRepository.listByProject({
      organization_id: config.organizationId,
      creative_project_id: config.projectId,
    }),
    ProductionTaskRuntime.list({
      organization_id: config.organizationId,
      creative_project_id: config.projectId,
      production_graph_id: config.graphId,
    }),
  ]);

  const activeDossiers = list(nodes).filter((node) =>
    text(node.type).toUpperCase() === "PRODUCTION_DOSSIER" &&
    activeRecord(node),
  );
  const activeGraphs = list(graphs).filter(activeRecord);
  if (
    activeDossiers.length !== 1 ||
    text(activeDossiers[0]?.id) !== config.dossierId
  ) {
    throw new Error(
      `APPROVED_PRODUCTION_ACTIVE_DOSSIER_MISMATCH:` +
      activeDossiers.map((node) => node.id).join(","),
    );
  }
  if (
    activeGraphs.length !== 1 ||
    text(activeGraphs[0]?.id) !== config.graphId
  ) {
    throw new Error(
      `APPROVED_PRODUCTION_ACTIVE_GRAPH_MISMATCH:` +
      activeGraphs.map((item) => item.id).join(","),
    );
  }
  if (tasks.length !== config.expectedTaskCount) {
    throw new Error(
      `APPROVED_PRODUCTION_TASK_COUNT_MISMATCH:` +
      `actual=${tasks.length};expected=${config.expectedTaskCount}`,
    );
  }

  const estimatedCost = taskCost(tasks, "estimated");
  if (!closeEnough(estimatedCost, config.ceiling)) {
    throw new Error(
      `APPROVED_PRODUCTION_TASK_COST_MISMATCH:` +
      `actual=${estimatedCost};ceiling=${config.ceiling}`,
    );
  }
  const foreignGraphTasks = tasks.filter(
    (task) => text(task.production_graph_id) !== config.graphId,
  );
  if (foreignGraphTasks.length) {
    throw new Error(
      `APPROVED_PRODUCTION_FOREIGN_GRAPH_TASKS:` +
      ids(foreignGraphTasks).join(","),
    );
  }
  const terminalFailures = tasks.filter((task) =>
    ["FAILED", "SKIPPED"].includes(text(task.status).toUpperCase()),
  );
  if (terminalFailures.length) {
    terminalFailures.forEach((task) =>
      console.error(`EXISTING_FAILED_TASK=${taskFailureSummary(task)}`),
    );
    throw new Error(
      `APPROVED_PRODUCTION_EXISTING_TASK_FAILURES:` +
      ids(terminalFailures).join(","),
    );
  }

  return { dossier, graph, tasks };
}

async function verifyAuthenticatedApproval(config) {
  const approval = await CreativeApprovalRuntime.findCurrentApproval({
    organization_id: config.organizationId,
    subject_asset_node_id: config.dossierId,
    scope: "PRODUCTION_DOSSIER",
  });
  if (!approval) {
    throw new Error(
      "AUTHENTICATED_PRODUCTION_DOSSIER_APPROVAL_REQUIRED",
    );
  }
  const approvalCeiling = finite(approval.metadata?.approved_cost_ceiling);
  if (
    approvalCeiling === null ||
    !closeEnough(approvalCeiling, config.ceiling) ||
    text(approval.metadata?.currency).toUpperCase() !== config.currency
  ) {
    throw new Error("AUTHENTICATED_PRODUCTION_APPROVAL_COST_MISMATCH");
  }
  if (
    !text(approval.metadata?.approver_user_id) ||
    !text(approval.metadata?.approver_staff_account_id)
  ) {
    throw new Error("AUTHENTICATED_PRODUCTION_APPROVER_IDENTITY_REQUIRED");
  }
  return approval;
}

async function verifyApprovedGraph(config) {
  const graph = await ProductionGraphRepository.getById(config.graphId);
  if (text(graph?.status).toUpperCase() !== "APPROVED") {
    throw new Error("AUTHENTICATED_PRODUCTION_GRAPH_APPROVAL_REQUIRED");
  }
  if (
    finite(graph.metadata?.approved_cost_ceiling) === null ||
    !closeEnough(graph.metadata?.approved_cost_ceiling, config.ceiling)
  ) {
    throw new Error("AUTHENTICATED_PRODUCTION_GRAPH_COST_MISMATCH");
  }
  return graph;
}

async function acquireProductionLease(scope, config) {
  const startedAt = Date.now();
  let attempts = 0;
  while (Date.now() - startedAt <= config.lockWaitMs) {
    attempts += 1;
    const token = await CreativeStateEngine.acquireExecutionLock(scope);
    if (token) {
      console.log(`EXECUTION_LOCK_ACQUIRED=YES|ATTEMPTS=${attempts}`);
      return token;
    }
    const state = await CreativeStateEngine.get(scope);
    console.log(
      `EXECUTION_LOCK_WAITING=YES|ATTEMPT=${attempts}|` +
      `LOCKED_AT=${state?.locked_at || "UNKNOWN"}`,
    );
    await sleep(config.lockRetryMs);
  }
  throw new Error(
    `CREATIVE_PRODUCTION_EXECUTION_LOCK_TIMEOUT:${config.lockWaitMs}`,
  );
}

async function produce(config) {
  const scope = {
    organization_id: config.organizationId,
    creative_mission_id: config.missionId,
    creative_project_id: config.projectId,
    production_graph_id: config.graphId,
  };
  const lockToken = await acquireProductionLease(scope, config);

  let finalisation = null;
  let cycle = 0;
  try {
    await CreativeStateEngine.set(scope, PIPELINE_STAGES.PRODUCING);

    while (cycle < config.maxPollCycles) {
      cycle += 1;
      const renewed = await CreativeStateEngine.renewExecutionLock({
        ...scope,
        execution_lock_token: lockToken,
      });
      if (!renewed) {
        throw new Error("CREATIVE_PRODUCTION_EXECUTION_LOCK_LOST");
      }

      const before = await ProductionQueueRuntime.build(scope);
      const beforeCounts = queueCounts(before);
      if (beforeCounts.failed || beforeCounts.blocked) {
        printQueueFailures(before);
        throw new Error(
          `CREATIVE_PRODUCTION_QUEUE_BLOCKED:` +
          `failed=${ids(before.failed).join(",") || "NONE"};` +
          `blocked=${ids(before.blocked).join(",") || "NONE"}`,
        );
      }

      const result = await ProductionQueueRuntime.dispatchAll(scope, {
        maxTasks: config.expectedTaskCount,
        maxPasses: 1,
        runPostProduction: true,
        pollRunning: true,
      });
      if (result.finalisation) finalisation = result.finalisation;

      const after = await ProductionQueueRuntime.build(scope);
      const counts = queueCounts(after);
      console.log(
        `PRODUCTION_CYCLE=${cycle}|` +
        `WAITING=${counts.waiting}|READY=${counts.ready}|` +
        `RUNNING=${counts.running}|REVIEW=${counts.review}|` +
        `COMPLETED=${counts.completed}|FAILED=${counts.failed}|` +
        `BLOCKED=${counts.blocked}|DISPATCHED=${result.total || 0}|` +
        `POLLED=${result.poll_total || 0}`,
      );

      if (counts.failed || counts.blocked) {
        printQueueFailures(after);
        throw new Error(
          `CREATIVE_PRODUCTION_QUEUE_FAILED:` +
          `failed=${ids(after.failed).join(",") || "NONE"};` +
          `blocked=${ids(after.blocked).join(",") || "NONE"}`,
        );
      }

      const unsettled = counts.waiting + counts.ready + counts.running;
      if (unsettled === 0) {
        if (!finalisation) {
          finalisation = await CreativeFinalisationRouter.run(scope);
        }
        await CreativeStateEngine.set(scope, PIPELINE_STAGES.REVIEWING);
        return { queue: after, finalisation, cycles: cycle };
      }

      const progressed =
        Number(result.total || 0) > 0 ||
        Number(result.poll_total || 0) > 0;
      if (!progressed && counts.running === 0) {
        throw new Error(
          `CREATIVE_PRODUCTION_NO_PROGRESS:` +
          `waiting=${counts.waiting};ready=${counts.ready}`,
        );
      }

      await sleep(config.pollIntervalMs);
    }

    throw new Error(
      `CREATIVE_PRODUCTION_POLL_LIMIT_REACHED:${config.maxPollCycles}`,
    );
  } finally {
    await CreativeStateEngine.releaseExecutionLock({
      ...scope,
      execution_lock_token: lockToken,
    });
  }
}

try {
  const config = requiredEnvironment();
  const immutable = await verifyImmutableScope(config);
  const approval = await verifyAuthenticatedApproval(config);
  await verifyApprovedGraph(config);

  console.log("============================================================");
  console.log("AVANTIQO APPROVED CREATIVE PRODUCTION");
  console.log("============================================================");
  console.log(`ORGANIZATION_ID=${config.organizationId}`);
  console.log(`CREATIVE_MISSION_ID=${config.missionId}`);
  console.log(`CREATIVE_PROJECT_ID=${config.projectId}`);
  console.log(`PRODUCTION_DOSSIER_ID=${config.dossierId}`);
  console.log(`PRODUCTION_GRAPH_ID=${config.graphId}`);
  console.log(`APPROVAL_RECORD_ID=${approval.id}`);
  console.log(`APPROVED_COST_CEILING=${config.ceiling}`);
  console.log(`APPROVED_CURRENCY=${config.currency}`);
  console.log(`APPROVED_TASK_COUNT=${immutable.tasks.length}`);
  console.log(`APPROVED_TASK_ESTIMATED_COST=${taskCost(immutable.tasks, "estimated")}`);
  console.log("PAID_MEDIA_EXECUTION_AUTHORIZED=YES");
  console.log("PUBLICATION_AUTHORIZED=NO");
  console.log("============================================================");

  const result = await produce(config);
  const finalTasks = await ProductionTaskRuntime.list({
    organization_id: config.organizationId,
    creative_project_id: config.projectId,
    production_graph_id: config.graphId,
  });
  const finalCounts = queueCounts(result.queue);

  console.log("============================================================");
  console.log("AVANTIQO APPROVED PRODUCTION SETTLED");
  console.log("============================================================");
  console.log(`PRODUCTION_CYCLES=${result.cycles}`);
  console.log(`TASK_COMPLETED_COUNT=${finalCounts.completed}`);
  console.log(`TASK_REVIEW_COUNT=${finalCounts.review}`);
  console.log(`TASK_FAILED_COUNT=${finalCounts.failed}`);
  console.log(`TASK_BLOCKED_COUNT=${finalCounts.blocked}`);
  console.log(`TASK_ACTUAL_COST=${taskCost(finalTasks, "actual")}`);
  console.log(`FINALISATION_CREATED=${Boolean(result.finalisation)}`);
  console.log(
    `FINALISATION_RESULT=${JSON.stringify(result.finalisation || {})}`,
  );
  console.log("CREATIVE_STATE=REVIEWING");
  console.log("PUBLICATION_AUTHORIZED=NO");
  console.log("PRODUCTION_STATUS=SUCCESS");
  console.log("TERMINAL_REMAINS_OPEN=YES");
} catch (error) {
  console.error("============================================================");
  console.error("AVANTIQO APPROVED PRODUCTION FAILED");
  console.error("============================================================");
  console.error(`ERROR=${error?.message || String(error)}`);
  console.error("PUBLICATION_AUTHORIZED=NO");
  console.error("PRODUCTION_STATUS=FAILED");
  console.error("TERMINAL_REMAINS_OPEN=YES");
  process.exitCode = 1;
}