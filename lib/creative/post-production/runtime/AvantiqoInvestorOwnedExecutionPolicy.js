import {
  ownedProviderForCapability,
} from "@/lib/platform/service-runtime/providers/AvantiqoOwnedProviderPolicy";
import {
  ownedPricingCertification,
} from "@/lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy";
import {
  getProviderPricing,
} from "@/lib/platform/service-runtime/pricing/repositories/ProviderPricingRepository";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  assertInvestorHumanGenerationPolicy,
  investorHumanGenerationPolicy,
  investorVideoTaskRequiresHumanControl,
} from "@/lib/creative/video/runtime/CreativeInvestorHumanGenerationPolicy";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function investorOwnedProviderPolicy(capability) {
  const requested = text(capability);
  if (!requested) throw new Error("INVESTOR_OWNED_CAPABILITY_REQUIRED");
  const provider = ownedProviderForCapability(requested);
  if (!provider) {
    throw new Error(`INVESTOR_OWNED_PROVIDER_REQUIRED:${requested}`);
  }

  return Object.freeze({
    contract: "AVANTIQO_INVESTOR_OWNED_ONLY_PROVIDER_POLICY_V1",
    allowed_providers: Object.freeze([provider]),
    preferred_providers: Object.freeze([provider]),
    owned_first_required: true,
    owned_only_required: true,
    external_fallback_allowed: false,
    external_provider_role: "FORBIDDEN",
    provider_selection_boundary: "SERVICE_RUNTIME_ONLY",
    creative_provider_selection_forbidden: true,
  });
}

export async function assertInvestorOwnedCapabilityReady(capability) {
  const requested = text(capability);
  if (!requested) throw new Error("INVESTOR_OWNED_CAPABILITY_REQUIRED");

  const provider = ownedProviderForCapability(requested);
  if (!provider) {
    throw new Error(`INVESTOR_OWNED_PROVIDER_REQUIRED:${requested}`);
  }

  const pricing = await getProviderPricing({
    provider,
    capability: requested,
  });
  if (!pricing) {
    throw new Error(
      `INVESTOR_OWNED_ENGINE_CERTIFICATION_REQUIRED:${requested}:${provider}`,
    );
  }

  const certification = ownedPricingCertification({
    provider,
    capability: requested,
    pricing,
  });
  if (!certification.eligible) {
    throw new Error(
      `INVESTOR_OWNED_ENGINE_NOT_CERTIFIED:${requested}:${provider}:${certification.failed_checks.join(",")}`,
    );
  }

  return Object.freeze({
    capability: requested,
    provider,
    pricing_id: pricing.id,
    model: pricing.model || null,
    certification,
  });
}

export async function preflightInvestorOwnedCapabilities(capabilities = []) {
  const requested = [...new Set(
    (Array.isArray(capabilities) ? capabilities : [])
      .map(text)
      .filter((capability) => capability.startsWith("ai.")),
  )];
  const ready = [];

  for (const capability of requested) {
    ready.push(await assertInvestorOwnedCapabilityReady(capability));
  }

  return Object.freeze({
    contract: "AVANTIQO_INVESTOR_OWNED_ENGINE_PREFLIGHT_V1",
    owned_only_required: true,
    external_provider_fallback_allowed: false,
    ready,
  });
}

export function assertInvestorOwnedResult({ capability, provider } = {}) {
  const expected = ownedProviderForCapability(capability);
  if (!expected) {
    throw new Error(`INVESTOR_OWNED_PROVIDER_REQUIRED:${text(capability) || "MISSING"}`);
  }
  if (text(provider) !== expected) {
    throw new Error(
      `INVESTOR_EXTERNAL_PROVIDER_FORBIDDEN:${text(capability)}:${text(provider) || "MISSING"}`,
    );
  }
  return true;
}

function investorHumanTaskPolicy({ task, scene } = {}) {
  const capability = text(task?.capability || task?.service_code).toLowerCase();
  if (!capability.startsWith("ai.video.")) return null;
  if (!investorVideoTaskRequiresHumanControl({ scene, task })) return null;
  const policy = investorHumanGenerationPolicy(scene, { required: true });
  assertInvestorHumanGenerationPolicy(policy);
  return policy;
}

export async function enforceInvestorOwnedProjectTasks({
  organization_id,
  creative_project_id,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");

  const project = await CreativeProjectRuntime.get(creative_project_id);
  if (!project || text(project.organization_id) !== text(organization_id)) {
    throw new Error("INVESTOR_OWNED_PROJECT_SCOPE_MISMATCH");
  }
  const investorScene = Number(project.metadata?.investor_scene) || null;
  if (!investorScene) {
    throw new Error("INVESTOR_OWNED_PROJECT_SCENE_REQUIRED");
  }

  const tasks = await ProductionTaskRuntime.list({
    organization_id,
    creative_project_id,
  });
  const updated = [];
  let humanControlledVideoTaskCount = 0;

  for (const task of tasks) {
    const capability = text(task.capability || task.service_code);
    if (!capability.startsWith("ai.")) continue;
    const providerPolicy = investorOwnedProviderPolicy(capability);
    const humanGeneration = investorHumanTaskPolicy({
      task,
      scene: investorScene,
    });
    if (humanGeneration) humanControlledVideoTaskCount += 1;

    if (task.status === "COMPLETED") {
      const provider = text(
        task.output?.provider ||
        task.output?.provider_submission?.provider ||
        task.provider_id,
      );
      assertInvestorOwnedResult({ capability, provider });
      if (humanGeneration) {
        const release = object(task.output?.investor_human_release);
        if (
          release.contract !== humanGeneration.release_gate_contract ||
          release.release_authorized !== true ||
          release.release_status !== "AUTHORIZED"
        ) {
          throw new Error(
            `INVESTOR_HUMAN_COMPLETED_TASK_RELEASE_EVIDENCE_REQUIRED:${task.id}`,
          );
        }
      }
      updated.push(task);
      continue;
    }

    updated.push(await ProductionTaskRuntime.update(task.id, {
      provider_id: null,
      input: {
        ...object(task.input),
        investor_scene: investorScene,
        ...(humanGeneration
          ? {
            human_mode: true,
            investor_human_generation: humanGeneration,
          }
          : {}),
        provider_policy: {
          ...object(task.input?.provider_policy),
          ...providerPolicy,
          allowed_providers: [...providerPolicy.allowed_providers],
          preferred_providers: [...providerPolicy.preferred_providers],
        },
      },
      metadata: {
        ...object(task.metadata),
        investor_scene: investorScene,
        provider: null,
        provider_policy: {
          ...object(task.metadata?.provider_policy),
          ...providerPolicy,
          allowed_providers: [...providerPolicy.allowed_providers],
          preferred_providers: [...providerPolicy.preferred_providers],
        },
        ...(humanGeneration
          ? {
            investor_human_controlled: true,
            investor_human_generation: humanGeneration,
            generic_video_dispatch_forbidden: true,
          }
          : {}),
        investor_owned_only_execution: true,
        external_provider_fallback_forbidden: true,
      },
    }));
  }

  return Object.freeze({
    contract: "AVANTIQO_INVESTOR_OWNED_ONLY_TASK_ENFORCEMENT_V2_HUMAN_CONTROLLED",
    organization_id,
    creative_project_id,
    investor_scene: investorScene,
    task_count: tasks.length,
    enforced_task_count: updated.length,
    human_controlled_video_task_count: humanControlledVideoTaskCount,
    generic_video_dispatch_for_humans: "FORBIDDEN",
    external_provider_fallback_allowed: false,
  });
}

export const AVANTIQO_INVESTOR_OWNED_EXECUTION_POLICY = Object.freeze({
  contract: "AVANTIQO_INVESTOR_OWNED_ONLY_EXECUTION_V2_HUMAN_CONTROLLED",
  reasoning: investorOwnedProviderPolicy("ai.reasoning.execute"),
  image: investorOwnedProviderPolicy("ai.image.generate"),
  video: investorOwnedProviderPolicy("ai.video.generate"),
  music: investorOwnedProviderPolicy("ai.music.generate"),
  speech: investorOwnedProviderPolicy("ai.text.to.speech"),
  human_video: Object.freeze({
    generic_video_dispatch: "FORBIDDEN",
    generation_contract: "AVANTIQO_VIDEO_HUMAN_MULTI_KEYFRAME_NATIVE_MASTER_V1",
    qc_contract: "AVANTIQO_INVESTOR_HUMAN_QC_PACK_V1",
    release_contract: "AVANTIQO_INVESTOR_HUMAN_RELEASE_V1",
  }),
  fallback: "FORBIDDEN",
});

export default AVANTIQO_INVESTOR_OWNED_EXECUTION_POLICY;
