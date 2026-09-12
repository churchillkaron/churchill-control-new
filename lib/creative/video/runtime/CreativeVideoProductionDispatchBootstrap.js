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
import {
  CreativeVideoNativeControlRuntime,
} from "./CreativeVideoNativeControlRuntime";
import {
  CreativeCinematographyAcquisitionRuntime,
} from "./CreativeCinematographyAcquisitionRuntime";
import {
  CreativeProfessionalFilmCraftRuntime,
} from "./CreativeProfessionalFilmCraftRuntime";
import {
  CreativeVideoGenerationEnvelopeRuntime,
} from "./CreativeVideoGenerationEnvelopeRuntime.js";
import {
  CreativeShotDpIntentRuntime,
} from "./CreativeShotDpIntentRuntime.js";
import {
  assertInvestorHumanGenerationPolicy,
  investorVideoTaskRequiresHumanControl,
  INVESTOR_HUMAN_GENERATION_CONTRACT,
} from "./CreativeInvestorHumanGenerationPolicy";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.video-production-dispatch.v6-professional-filmcraft",
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

function videoShotId(task = {}) {
  return text(
    task.shot_id ||
    task.metadata?.shot_id ||
    task.input?.shot_id ||
    task.input?.metadata?.shot_id ||
    task.input?.generation?.shot_id,
  ) || null;
}

function investorOwnedOnly(task = {}) {
  return (
    task.metadata?.investor_owned_only_execution === true ||
    task.metadata?.provider_policy?.owned_only_required === true ||
    task.input?.provider_policy?.owned_only_required === true
  );
}

function investorScene(task = {}) {
  const value = Number(
    task.metadata?.investor_scene ||
    task.input?.investor_scene ||
    task.input?.metadata?.investor_scene,
  );
  return Number.isFinite(value) && value > 0 ? value : null;
}

function assertGenericVideoDispatchAllowed(task = {}) {
  if (!investorOwnedOnly(task)) return;
  const scene = investorScene(task);
  if (!investorVideoTaskRequiresHumanControl({ scene, task })) return;

  const policy = object(
    task.metadata?.investor_human_generation ||
    task.input?.investor_human_generation,
  );
  assertInvestorHumanGenerationPolicy(policy);
  throw new Error(
    `AVANTIQO_INVESTOR_HUMAN_GENERIC_VIDEO_DISPATCH_FORBIDDEN:SCENE_${scene || "UNKNOWN"}:` +
    `USE_${INVESTOR_HUMAN_GENERATION_CONTRACT}`,
  );
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
  const budgetQualityGoverned =
    text(existingPolicy.budget_quality_optimization_contract) ===
    "AVANTIQO_BUDGET_QUALITY_SHOT_POLICY_V1";
  return {
    ...existingPolicy,
    ...routedPolicy,
    ...(budgetQualityGoverned
      ? {
          budget_quality_optimization_contract:
            existingPolicy.budget_quality_optimization_contract,
        }
      : {}),
    selection_weights: budgetQualityGoverned
      ? {
          ...object(routedPolicy.selection_weights || routedPolicy.weights),
          ...object(existingPolicy.selection_weights || existingPolicy.weights),
        }
      : {
          ...object(existingPolicy.selection_weights || existingPolicy.weights),
          ...object(routedPolicy.selection_weights || routedPolicy.weights),
        },
  };
}

function enforceStudioOwnedVideoPolicy(policy = {}) {
  return {
    ...object(policy),
    allowed_providers: ["avantiqo-video"],
    preferred_providers: ["avantiqo-video"],
    owned_first_required: true,
    owned_only_required: true,
    external_fallback_allowed: false,
    external_provider_role: "FORBIDDEN",
    provider_selection_boundary: "SERVICE_RUNTIME_ONLY",
    creative_provider_selection_forbidden: true,
  };
}

function alreadyRouted(task = {}) {
  return task.metadata?.creative_video_engine_route?.contract ===
    CreativeVideoEngineRouter.contract &&
    task.input?.shot_bible?.contract === CreativeShotBibleRuntime.contract &&
    task.input?.cinematography_acquisition?.contract ===
      CreativeCinematographyAcquisitionRuntime.contract &&
    task.input?.professional_filmcraft?.contract ===
      CreativeProfessionalFilmCraftRuntime.contract &&
    task.input?.metadata?.creative_video_native_control?.contract ===
      CreativeVideoNativeControlRuntime.contract &&
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
    const shotId = videoShotId(task);
    if (!task || !capability || !shotId) {
      return dispatch(id);
    }

    if (
      task.status === "RUNNING" ||
      task.status === "COMPLETED"
    ) {
      return dispatch(id);
    }

    assertGenericVideoDispatchAllowed(task);

    if (alreadyRouted(task)) {
      return dispatch(id);
    }

    const investorOwned = investorOwnedOnly(task);
    const shot = await ShotRepository.get(shotId);
    if (!shot) {
      throw new Error(`CREATIVE_VIDEO_SHOT_NOT_FOUND:${shotId}`);
    }
    if (
      text(shot.organization_id) !== text(task.organization_id) ||
      text(shot.creative_project_id) !== text(task.creative_project_id)
    ) {
      throw new Error("CREATIVE_VIDEO_SHOT_SCOPE_MISMATCH");
    }

    const scopedTask = { ...task, shot_id: shotId };
    const cinematographyAcquisition =
      CreativeCinematographyAcquisitionRuntime.assert(
        CreativeCinematographyAcquisitionRuntime.compile({
          shot,
          task: scopedTask,
        }),
      );
    const professionalFilmCraft =
      CreativeProfessionalFilmCraftRuntime.assert(
        CreativeProfessionalFilmCraftRuntime.compile({
          shot,
          task: scopedTask,
          cinematography_acquisition: cinematographyAcquisition,
        }),
      );
    const dpIntent = CreativeShotDpIntentRuntime.build({
      shot,
      physical_world: task.input?.requirements?.physical_world || {},
      cinematography_acquisition: cinematographyAcquisition,
      professional_filmcraft: professionalFilmCraft,
    });
    const dpIntentGate = CreativeShotDpIntentRuntime.evaluate(dpIntent);
    if (!dpIntentGate.passed) {
      throw new Error(`CREATIVE_SHOT_DP_INTENT_REQUIRED:${dpIntentGate.failures.join(",")}`);
    }
    const dpScopedTask = {
      ...scopedTask,
      input: {
        ...object(scopedTask.input),
        requirements: {
          ...object(scopedTask.input?.requirements),
          dp_intent: dpIntent,
          dp_intent_gate: dpIntentGate,
        },
      },
    };
    const baseShotBible = CreativeShotBibleRuntime.assert(
      CreativeShotBibleRuntime.build({ shot, task: dpScopedTask }),
    );
    const shotBible = {
      ...baseShotBible,
      cinematography_acquisition: cinematographyAcquisition,
      professional_filmcraft: professionalFilmCraft,
      dp_intent: dpIntent,
      dp_intent_gate: dpIntentGate,
    };
    const route = CreativeVideoEngineRouter.assert(
      CreativeVideoEngineRouter.resolve({
        shot_bible: shotBible,
        capability,
      }),
    );
    const sanitizedInput = stripCreativeProviderPins(task.input);
    const providerPolicy = enforceStudioOwnedVideoPolicy(
      mergeProviderPolicy(
        sanitizedInput.provider_policy || task.metadata?.provider_policy,
        route.provider_policy,
      ),
    );
    const nativeControlledInput = CreativeVideoNativeControlRuntime.apply({
      ...sanitizedInput,
      shot_id: shotId,
      capability,
      shot_bible: shotBible,
      cinematography_acquisition: cinematographyAcquisition,
      professional_filmcraft: professionalFilmCraft,
      dp_intent: dpIntent,
      provider_policy: providerPolicy,
    });
    const generationEnvelope = CreativeVideoGenerationEnvelopeRuntime.assert(
      CreativeVideoGenerationEnvelopeRuntime.build(nativeControlledInput),
    );
    const controlledInput = {
      ...nativeControlledInput,
      generation_envelope: generationEnvelope,
      cinematography_acquisition: cinematographyAcquisition,
      professional_filmcraft: professionalFilmCraft,
      dp_intent: dpIntent,
      metadata: {
        ...object(nativeControlledInput.metadata),
        creative_cinematography_acquisition: {
          contract: cinematographyAcquisition.contract,
          status: cinematographyAcquisition.status,
          applicability: cinematographyAcquisition.applicability,
          inferred_fields: cinematographyAcquisition.inferred_fields,
          blocking_issues: cinematographyAcquisition.blocking_issues,
          warnings: cinematographyAcquisition.warnings,
          evidence: cinematographyAcquisition.evidence,
          provider_neutral: true,
          provider_knobs_invented: false,
        },
        creative_dp_intent: {
          contract: dpIntent.contract,
          gate: dpIntentGate,
          provider_may_replace_lens_or_light_plan: dpIntent.provider_may_replace_lens_or_light_plan,
        },
        creative_professional_filmcraft: {
          contract: professionalFilmCraft.contract,
          status: professionalFilmCraft.status,
          applicability: professionalFilmCraft.applicability,
          blocking_issues: professionalFilmCraft.blocking_issues,
          craft_qc: professionalFilmCraft.craft_qc,
          evidence: professionalFilmCraft.evidence,
          provider_neutral: true,
          provider_knobs_invented: false,
        },
      },
    };

    task = await ProductionTaskRuntime.update(task.id, {
      shot_id: shotId,
      provider_id: null,
      input: controlledInput,
      metadata: {
        ...object(task.metadata),
        shot_id: shotId,
        provider: null,
        provider_policy: providerPolicy,
        creative_shot_bible_contract: shotBible.contract,
        creative_cinematography_acquisition_contract:
          cinematographyAcquisition.contract,
        creative_cinematography_acquisition_status:
          cinematographyAcquisition.status,
        creative_cinematography_acquisition_evidence:
          cinematographyAcquisition.evidence,
        creative_dp_intent_contract: dpIntent.contract,
        creative_dp_intent_gate: dpIntentGate,
        creative_professional_filmcraft_contract:
          professionalFilmCraft.contract,
        creative_professional_filmcraft_status:
          professionalFilmCraft.status,
        creative_professional_filmcraft_qc:
          professionalFilmCraft.craft_qc,
        creative_professional_filmcraft_evidence:
          professionalFilmCraft.evidence,
        creative_video_native_control_contract:
          CreativeVideoNativeControlRuntime.contract,
        creative_video_generation_envelope_contract:
          CreativeVideoGenerationEnvelopeRuntime.contract,
        creative_video_generation_envelope_hash:
          generationEnvelope.envelope_hash,
        creative_video_native_control:
          object(controlledInput.metadata?.creative_video_native_control),
        creative_video_engine_route: {
          contract: route.contract,
          status: route.status,
          decision: route.decision,
          execution_capability: route.execution_capability,
          primary: null,
          challengers: [],
          evidence: {
            ...(route.evidence || {}),
            investor_owned_only_execution: investorOwned,
            studio_owned_only_execution: true,
            external_provider_fallback_allowed: false,
            native_control_contract: CreativeVideoNativeControlRuntime.contract,
            cinematography_acquisition_contract:
              cinematographyAcquisition.contract,
            cinematography_acquisition_status:
              cinematographyAcquisition.status,
            cinematography_acquisition_evidence:
              cinematographyAcquisition.evidence,
            professional_filmcraft_contract:
              professionalFilmCraft.contract,
            professional_filmcraft_status:
              professionalFilmCraft.status,
            professional_filmcraft_evidence:
              professionalFilmCraft.evidence,
            first_frame_bound:
              controlledInput.metadata?.creative_video_native_control?.first_frame_bound === true,
            last_frame_bound:
              controlledInput.metadata?.creative_video_native_control?.last_frame_bound === true,
            keyframe_count:
              Number(controlledInput.metadata?.creative_video_native_control?.keyframe_count || 0),
            camera_motion_reference_bound:
              controlledInput.metadata?.creative_video_native_control?.camera_motion_reference_bound === true,
            performance_reference_bound:
              controlledInput.metadata?.creative_video_native_control?.performance_reference_bound === true,
            native_audio_required:
              controlledInput.metadata?.creative_video_native_control?.native_audio_required === true,
          },
        },
        budget_quality_optimization_contract:
          providerPolicy.budget_quality_optimization_contract || null,
        budget_quality_selection_weights:
          providerPolicy.selection_weights || null,
        video_provider_selection_owner: "SERVICE_RUNTIME",
        creative_provider_selection_forbidden: true,
        owned_first_required: true,
        owned_only_required: true,
        external_provider_role: "FORBIDDEN",
        external_provider_fallback_forbidden: true,
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
  native_control_contract: CreativeVideoNativeControlRuntime.contract,
  cinematography_acquisition_contract:
    CreativeCinematographyAcquisitionRuntime.contract,
  professional_filmcraft_contract:
    CreativeProfessionalFilmCraftRuntime.contract,
  budget_quality_contract: "AVANTIQO_BUDGET_QUALITY_SHOT_POLICY_V1",
  investor_human_generic_video_dispatch: "FORBIDDEN",
  investor_human_generation_contract: INVESTOR_HUMAN_GENERATION_CONTRACT,
  provider_selection_owner: "SERVICE_RUNTIME",
});
