import {
  CreativePostProductionRuntime,
} from "@/lib/creative/post-production/runtime/CreativePostProductionRuntime";
import {
  ShotRuntime,
} from "@/lib/creative/shots/runtime/ShotRuntime";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CreativeCompositingRuntime,
} from "@/lib/creative/compositing/runtime/CreativeCompositingRuntime";
import {
  CreativeLayeredCompositingRenderRuntime,
} from "@/lib/creative/compositing/runtime/CreativeLayeredCompositingRenderRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.project-compositing-bootstrap.v1",
);
const CONTRACT = "AVANTIQO_PROJECT_COMPOSITING_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function hasStructured(value) {
  if (Array.isArray(value)) return value.length > 0;
  return Object.keys(object(value)).length > 0;
}

function contractFromTask(task = {}) {
  const input = object(task.input);
  const requirements = object(input.requirements);
  const candidate = object(
    input.compositing_contract ||
    requirements.compositing_contract ||
    task.metadata?.compositing_contract_data,
  );
  return text(candidate.contract) === CreativeCompositingRuntime.contract
    ? candidate
    : null;
}

function taskForShot(tasks = [], shotId) {
  return tasks.find((task) =>
    text(task.shot_id || task.input?.shot_id || task.metadata?.shot_id) === text(shotId) &&
    contractFromTask(task),
  ) || null;
}

async function prepare({ organization_id, creative_project_id, policy = {} } = {}) {
  const [shots, tasks, nodes] = await Promise.all([
    ShotRuntime.list({ organization_id, creative_project_id }),
    ProductionTaskRuntime.list({ organization_id, creative_project_id }),
    AssetGraphRepository.listByProject({ organization_id, creative_project_id }),
  ]);
  const applicableShots = list(shots).filter((shot) =>
    hasStructured(shot.compositing),
  );
  if (!applicableShots.length) {
    return {
      contract: CONTRACT,
      applicable: false,
      status: "NOT_APPLICABLE",
      renders: [],
      blockers: [],
    };
  }

  const blockers = [];
  const renders = [];
  let mutableNodes = nodes;
  for (const shot of applicableShots) {
    const task = taskForShot(tasks, shot.id);
    const compositingContract = task ? contractFromTask(task) : null;
    if (!compositingContract) {
      blockers.push(`SHOT_${shot.id}:COMPOSITING_PREAUTHORED_CONTRACT_REQUIRED`);
      continue;
    }
    const verified = CreativeCompositingRuntime.verify({
      ...shot,
      compositing_contract: compositingContract,
    });
    if (verified.status !== "READY") {
      blockers.push(
        `SHOT_${shot.id}:${verified.blocking_issues.map((item) => item.code).join("+")}`,
      );
      continue;
    }
    try {
      const rendered = await CreativeLayeredCompositingRenderRuntime.render({
        organization_id,
        creative_project_id,
        shot: {
          ...shot,
          compositing_contract: compositingContract,
        },
        nodes: mutableNodes,
        policy,
      });
      if (rendered.render) renders.push(rendered);
      mutableNodes = await AssetGraphRepository.listByProject({
        organization_id,
        creative_project_id,
      });
    } catch (error) {
      blockers.push(`SHOT_${shot.id}:${error?.message || String(error)}`);
    }
  }

  return {
    contract: CONTRACT,
    applicable: true,
    status: blockers.length ? "BLOCKED" : "READY",
    compositing_runtime_contract: CreativeCompositingRuntime.contract,
    compositing_render_contract: CreativeLayeredCompositingRenderRuntime.contract,
    shot_count: applicableShots.length,
    render_count: renders.length,
    renders,
    blockers,
  };
}

function install() {
  if (CreativePostProductionRuntime[INSTALL_FLAG]) return;
  const runWithoutCompositing = CreativePostProductionRuntime.run.bind(
    CreativePostProductionRuntime,
  );
  Object.defineProperty(CreativePostProductionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativePostProductionRuntime.run = async function runWithProjectCompositing(input = {}) {
    const compositing = await prepare({
      organization_id: input.organization_id,
      creative_project_id: input.creative_project_id,
      policy: input.compositing_policy || input.render_policy || {},
    });
    if (compositing.status === "BLOCKED") {
      return {
        status: "BLOCKED_BY_COMPOSITING",
        compositing,
      };
    }
    const result = await runWithoutCompositing(input);
    return {
      ...result,
      compositing,
    };
  };
}

install();

export const CreativeProjectCompositingBootstrap = Object.freeze({
  installed: true,
  contract: CONTRACT,
  prepare,
  fail_closed: true,
});
