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
  "avantiqo.creative.video-production-dispatch.v2",
);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function videoCapability(task = {}) {
  const capability = text(task.capability || task.service_code).toLowerCase();
  return capability.startsWith("ai.video.") ? capability : null;
}

function stripCreativeProviderPins(input = {}) {
  const source = object(input);
  const generation = object(source.generation);
  const providerPolicy = object(source.provider_policy);
  const {
    provider: _provider,
    provider_id: _providerId,
    model: _model,
    provider_model: _providerModel,
    ...generationWithoutPins
  } = generation;
  const {
    allowed_providers: _allowedProviders,
    allowedProviders: _allowedProvidersCamel,
    preferred_providers: _preferredProviders,
    preferredProviders: _preferredProvidersCamel,
    preferred_models: _preferredModels,
    preferredModels: _preferredModelsCamel,
    ...providerPolicyWithoutPins
  } = providerPolicy;
  const {
    provider: _inputProvider,
    provider_id: _inputProviderId,
    model: _inputModel,
    provider_model: _inputProviderModel,
    ...inputWithoutPins
  } = source;

  return {
    ...inputWithoutPins,
    ...(Object.keys(generation).length
      ? { generation: generationWithoutPins }
      : {}),
    provider_policy: providerPolicyWithoutPins,
  };
}

function mergeProviderPolicy(existing = {}, routed = {}) {
  const existingPolicy = object(existing);
  const routedPolicy = object(routed);
  return {
    ...existingPolicy,
    ...routedPolicy,
    selection_weights: {
      ...object(existingPolicy.selection_weights || existingPolicy.weights),
      ...object(routedPolicy.selection_weights || routedPolicy.weights),
    },
  };
}

function alreadyRouted(task = {}) {
  return task.metadata?.creative_video_engine_route?.contract ===
    CreativeVideoEngineRouter.contract &&
    task.input?.shot_bible?.contract === CreativeShotBibleRuntime.contract &&
    task.metadata?.video_provider_selection_owner === "SERVICE_RUNTIME";
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
    const capability = videoCapability(task);
    if (!task || !capability || !task.shot_id) {
      return dispatch(id);
    }

    if (
      task.status === "RUNNING" ||
      task.status === "COMPLETED" ||
      alreadyRouted(task)
    ) {
      return dispatch(id);
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
      CreativeVideoEngineRouter.resolve({
        shot_bible: shotBible,
        capability,
      }),
    );
    const sanitizedInput = stripCreativeProviderPins(task.input);
    const providerPolicy = mergeProviderPolicy(
      sanitizedInput.provider_policy || task.metadata?.provider_policy,
      route.provider_policy,
    );

    task = await ProductionTaskRuntime.update(task.id, {
      provider_id: null,
      input: {
        ...sanitizedInput,
        capability,
        shot_bible: shotBible,
        provider_policy: providerPolicy,
      },
      metadata: {
        ...object(task.metadata),
        provider: null,
        creative_shot_bible_contract: shotBible.contract,
        creative_video_engine_route: {
          contract: route.contract,
          status: route.status,
          decision: route.decision,
          execution_capability: route.execution_capability,
          primary: null,
          challengers: [],
          evidence: route.evidence || {},
        },
        video_provider_selection_owner: "SERVICE_RUNTIME",
        creative_provider_selection_forbidden: true,
        owned_first_required: true,
        external_provider_role: "SUPPLEMENTAL_OR_FALLBACK_ONLY",
        provider_prompts_persisted: false,
      },
    });

    return dispatch(task.id);
  };
}

install();

export const CreativeVideoProductionDispatchBootstrap = Object.freeze({
  installed: true,
  contract: CreativeVideoEngineRouter.contract,
  shot_bible_contract: CreativeShotBibleRuntime.contract,
  provider_selection_owner: "SERVICE_RUNTIME",
});
