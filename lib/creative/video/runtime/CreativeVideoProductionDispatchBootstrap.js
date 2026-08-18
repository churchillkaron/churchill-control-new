import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import * as ShotRepository
from "@/lib/creative/shots/repositories/ShotRepository";
import {
  CreativeShotBibleRuntime,
} from "./CreativeShotBibleRuntime";
import {
  CreativeVideoEngineRouter,
} from "./CreativeVideoEngineRouter";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.video-production-dispatch.v1",
);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function isVideoTask(task = {}) {
  return text(task.capability || task.service_code).toLowerCase() ===
    "ai.video.generate";
}

function mergeProviderPolicy(existing = {}, routed = {}) {
  return {
    ...object(existing),
    ...object(routed),
    selection_weights: {
      ...object(existing.selection_weights || existing.weights),
      ...object(routed.selection_weights || routed.weights),
    },
  };
}

function alreadyRouted(task = {}) {
  return task.metadata?.creative_video_engine_route?.contract ===
    CreativeVideoEngineRouter.contract &&
    task.input?.shot_bible?.contract === CreativeShotBibleRuntime.contract;
}

export async function prepareCreativeVideoProductionTask(inputTask = {}) {
  let task = inputTask;
  if (!task?.id || !isVideoTask(task) || !task.shot_id) {
    return task;
  }
  if (task.status === "COMPLETED" || alreadyRouted(task)) {
    return task;
  }

  const shot = await ShotRepository.get(task.shot_id);
  if (!shot) {
    throw new Error(`CREATIVE_VIDEO_SHOT_NOT_FOUND:${task.shot_id}`);
  }
  if (
    text(shot.organization_id) !== text(task.organization_id) ||
    text(shot.creative_project_id) !== text(task.creative_project_id)
  ) {
    throw new Error("CREATIVE_VIDEO_SHOT_SCOPE_MISMATCH");
  }

  const shotBible = CreativeShotBibleRuntime.assert(
    CreativeShotBibleRuntime.build({ shot, task }),
  );
  const route = CreativeVideoEngineRouter.assert(
    CreativeVideoEngineRouter.resolve({ shot_bible: shotBible }),
  );
  const providerPolicy = mergeProviderPolicy(
    task.input?.provider_policy || task.metadata?.provider_policy,
    route.provider_policy,
  );

  task = await ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      shot_bible: shotBible,
      provider_policy: providerPolicy,
    },
    metadata: {
      ...object(task.metadata),
      creative_shot_bible_contract: shotBible.contract,
      creative_video_engine_route: {
        contract: route.contract,
        status: route.status,
        decision: route.decision,
        primary: route.primary || null,
        challengers: route.challengers || [],
        evidence: route.evidence || {},
      },
      video_provider_selection_owner: "CREATIVE_VIDEO_ENGINE_ROUTER",
      provider_prompts_persisted: false,
    },
  });

  return task;
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;

  const dispatch = ProductionTaskRuntime.dispatch.bind(ProductionTaskRuntime);
  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchCreativeVideo(id) {
    let task = await ProductionTaskRuntime.get(id);
    if (!task || !isVideoTask(task) || !task.shot_id) {
      return dispatch(id);
    }

    if (
      task.status === "RUNNING" ||
      task.status === "COMPLETED" ||
      alreadyRouted(task)
    ) {
      return dispatch(id);
    }

    task = await prepareCreativeVideoProductionTask(task);
    return dispatch(task.id);
  };
}

install();

export const CreativeVideoProductionDispatchBootstrap = Object.freeze({
  installed: true,
  contract: CreativeVideoEngineRouter.contract,
  shot_bible_contract: CreativeShotBibleRuntime.contract,
  prepare: prepareCreativeVideoProductionTask,
});
