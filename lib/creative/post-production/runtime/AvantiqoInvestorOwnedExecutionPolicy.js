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

export async function enforceInvestorOwnedProjectTasks({
  organization_id,
  creative_project_id,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");

  const tasks = await ProductionTaskRuntime.list({
    organization_id,
    creative_project_id,
  });
  const updated = [];

  for (const task of tasks) {
    const capability = text(task.capability || task.service_code);
    if (!capability.startsWith("ai.")) continue;
    const providerPolicy = investorOwnedProviderPolicy(capability);

    if (task.status === "COMPLETED") {
      const provider = text(
        task.output?.provider ||
        task.output?.provider_submission?.provider ||
        task.provider_id,
      );
      assertInvestorOwnedResult({ capability, provider });
      updated.push(task);
      continue;
    }

    updated.push(await ProductionTaskRuntime.update(task.id, {
      provider_id: null,
      input: {
        ...object(task.input),
        provider_policy: {
          ...object(task.input?.provider_policy),
          ...providerPolicy,
          allowed_providers: [...providerPolicy.allowed_providers],
          preferred_providers: [...providerPolicy.preferred_providers],
        },
      },
      metadata: {
        ...object(task.metadata),
        provider: null,
        provider_policy: {
          ...object(task.metadata?.provider_policy),
          ...providerPolicy,
          allowed_providers: [...providerPolicy.allowed_providers],
          preferred_providers: [...providerPolicy.preferred_providers],
        },
        investor_owned_only_execution: true,
        external_provider_fallback_forbidden: true,
      },
    }));
  }

  return Object.freeze({
    contract: "AVANTIQO_INVESTOR_OWNED_ONLY_TASK_ENFORCEMENT_V1",
    organization_id,
    creative_project_id,
    task_count: tasks.length,
    enforced_task_count: updated.length,
    external_provider_fallback_allowed: false,
  });
}

export const AVANTIQO_INVESTOR_OWNED_EXECUTION_POLICY = Object.freeze({
  contract: "AVANTIQO_INVESTOR_OWNED_ONLY_EXECUTION_V1",
  reasoning: investorOwnedProviderPolicy("ai.reasoning.execute"),
  image: investorOwnedProviderPolicy("ai.image.generate"),
  video: investorOwnedProviderPolicy("ai.video.generate"),
  music: investorOwnedProviderPolicy("ai.music.generate"),
  speech: investorOwnedProviderPolicy("ai.text.to.speech"),
  fallback: "FORBIDDEN",
});

export default AVANTIQO_INVESTOR_OWNED_EXECUTION_POLICY;
