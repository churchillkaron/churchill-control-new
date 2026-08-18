import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import * as ShotRepository
from "@/lib/creative/shots/repositories/ShotRepository";
import {
  CreativeShotBibleRuntime,
} from "./CreativeShotBibleRuntime";
import {
  CreativeBrandMarkCompositingRuntime,
} from "./CreativeBrandMarkCompositingRuntime";
import {
  CreativeVideoEngineRouter,
} from "./CreativeVideoEngineRouter";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.video-production-dispatch.v1",
);
const PREPARATION_CONTRACT = "CREATIVE_VIDEO_PRODUCTION_READINESS_V2";

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

function currentPreparationEvidence(task = {}) {
  const readiness = object(task.metadata?.creative_video_production_readiness);
  const shotBible = object(task.input?.shot_bible);
  const compositing = object(shotBible.finishing?.brand_mark_compositing);

  return readiness.contract === PREPARATION_CONTRACT &&
    readiness.shot_bible_contract === CreativeShotBibleRuntime.contract &&
    readiness.video_engine_route_contract === CreativeVideoEngineRouter.contract &&
    text(readiness.brand_mark_compositing_contract) === text(compositing.contract);
}

function alreadyRouted(task = {}) {
  return task.metadata?.creative_video_engine_route?.contract ===
    CreativeVideoEngineRouter.contract &&
    task.input?.shot_bible?.contract === CreativeShotBibleRuntime.contract &&
    currentPreparationEvidence(task);
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

  let shotBible = CreativeShotBibleRuntime.build({ shot, task });
  shotBible = await CreativeBrandMarkCompositingRuntime.resolve({
    shot,
    task,
    shot_bible: shotBible,
  });
  shotBible = CreativeShotBibleRuntime.assert(shotBible);

  const route = CreativeVideoEngineRouter.assert(
    CreativeVideoEngineRouter.resolve({ shot_bible: shotBible }),
  );
  const providerPolicy = mergeProviderPolicy(
    task.input?.provider_policy || task.metadata?.provider_policy,
    route.provider_policy,
  );
  const brandMarkContract =
    shotBible.finishing?.brand_mark_compositing?.contract || null;

  task = await ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      shot_bible: shotBible,
      provider_policy: providerPolicy,
    },
    metadata: {
      ...object(task.metadata),
      creative_shot_bible_contract: shotBible.contract,
      creative_brand_mark_compositing_contract: brandMarkContract,
      creative_video_engine_route: {
        contract: route.contract,
        status: route.status,
        decision: route.decision,
        primary: route.primary || null,
        challengers: route.challengers || [],
        evidence: route.evidence || {},
      },
      creative_video_production_readiness: {
        contract: PREPARATION_CONTRACT,
        shot_bible_contract: shotBible.contract,
        video_engine_route_contract: route.contract,
        brand_mark_compositing_contract: brandMarkContract,
        prepared_at: new Date().toISOString(),
        provider_prompts_persisted: false,
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
  preparation_contract: PREPARATION_CONTRACT,
  shot_bible_contract: CreativeShotBibleRuntime.contract,
  brand_mark_compositing_contract: CreativeBrandMarkCompositingRuntime.contract,
  prepare: prepareCreativeVideoProductionTask,
});
