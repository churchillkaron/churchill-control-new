import {
  getProvider,
} from "./ProviderRegistry.js";
import {
  resolveProviderCredential,
} from "./ProviderCredentialRuntime";

const RUNTIME_LOADERS = {
  linkedin: () => import("./linkedin/LinkedInProvider").then((module) => module.LinkedInProvider),
  line: () => import("./line/LINEProvider").then((module) => module.LINEProvider),
  whatsapp: () => import("./whatsapp/WhatsAppProvider").then((module) => module.WhatsAppProvider),
  google: () => import("./google/GoogleProvider").then((module) => module.GoogleProvider),
  meta: async () => {
    await import("@/lib/marketing/bootstrap/registerMarketingPublishers");
    return import("./meta/MetaProvider").then((module) => module.MetaProvider);
  },
  openai: () => import("./openai/OpenAIProvider").then((module) => module.OpenAIProvider),
  flux: () => import("./flux/FluxProvider").then((module) => module.FluxProvider),
  runway: () => import("./runway/RunwayProvider").then((module) => module.RunwayProvider),
};

export async function loadProviderRuntime(providerId) {
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);
  if (provider.runtimeAvailable === false) {
    throw new Error(`Provider runtime unavailable: ${providerId}`);
  }

  const loader = RUNTIME_LOADERS[provider.runtime];
  if (!loader) throw new Error(`No runtime loader for ${provider.runtime}`);
  return loader();
}

async function executionCredential(provider, context = {}) {
  if (!context?.organization_id) return null;
  return resolveProviderCredential({
    organization_id: context.organization_id,
    provider,
    credential_id: context.credential_id || null,
  });
}

function providerInput({ capability, model, input, context, credential }) {
  return {
    capability,
    model,
    ...input,
    ...(credential || {}),
    organization_id: context?.organization_id || null,
    party_id: context?.party_id || null,
    entity_id: context?.entity_id || null,
    organization_service_id: context?.organization_service_id || null,
    usage_id: context?.usage_id || null,
    credential: credential || null,
    context,
    credential_id: context?.credential_id || null,
  };
}

async function preparedExecution({
  provider,
  capability,
  model,
  input = {},
  context = {},
}) {
  const runtime = await loadProviderRuntime(provider);
  const credential = await executionCredential(provider, context);
  const preparedInput = providerInput({
    capability,
    model,
    input,
    context,
    credential,
  });
  return { runtime, preparedInput };
}

export async function validateProviderExecution(input = {}) {
  const { runtime, preparedInput } = await preparedExecution(input);
  if (typeof runtime.validateInput === "function") {
    await runtime.validateInput(preparedInput);
  }
  return true;
}

export async function executeProvider(input = {}) {
  const { provider } = input;
  const { runtime, preparedInput } = await preparedExecution(input);
  if (typeof runtime.execute !== "function") {
    throw new Error(`Invalid provider runtime: ${provider}`);
  }

  return runtime.execute(preparedInput);
}

export async function getProviderStatus({
  provider,
  job_id,
  input = {},
  context = {},
}) {
  if (!provider) throw new Error("provider required");
  if (!job_id) throw new Error("job_id required");

  const runtime = await loadProviderRuntime(provider);
  const statusFunction = runtime.getStatus || runtime.poll || runtime.status;
  if (typeof statusFunction !== "function") {
    throw new Error(`Provider status runtime unavailable: ${provider}`);
  }

  const credential = await executionCredential(provider, context);
  return statusFunction.call(runtime, {
    job_id,
    provider_job_id: job_id,
    ...input,
    ...(credential || {}),
    organization_id: context?.organization_id || null,
    party_id: context?.party_id || null,
    entity_id: context?.entity_id || null,
    organization_service_id: context?.organization_service_id || null,
    usage_id: context?.usage_id || null,
    credential: credential || null,
    context,
    credential_id: context?.credential_id || null,
  });
}

export const ProviderExecutor = {
  executeProvider,
  validateProviderExecution,
  getProviderStatus,
  loadProviderRuntime,
};
