import {
  getProvider,
} from "./ProviderRegistry.js";

const RUNTIME_LOADERS = {
  linkedin: () => import("./linkedin/LinkedInProvider").then((module) => module.LinkedInProvider),
  line: () => import("./line/LINEProvider").then((module) => module.LINEProvider),
  whatsapp: () => import("./whatsapp/WhatsAppProvider").then((module) => module.WhatsAppProvider),
  google: () => import("./google/GoogleProvider").then((module) => module.GoogleProvider),
  meta: () => import("./meta/MetaProvider").then((module) => module.MetaProvider),
  openai: () => import("./openai/OpenAIProvider").then((module) => module.OpenAIProvider),
  flux: () => import("./flux/FluxProvider").then((module) => module.FluxProvider),
  runway: () => import("./runway/RunwayProvider").then((module) => module.RunwayProvider),
};

export async function loadProviderRuntime(providerId) {
  const provider = getProvider(providerId);

  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  if (provider.runtimeAvailable === false) {
    throw new Error(`Provider runtime unavailable: ${providerId}`);
  }

  const loader = RUNTIME_LOADERS[provider.runtime];
  if (!loader) {
    throw new Error(`No runtime loader for ${provider.runtime}`);
  }

  return loader();
}

export async function executeProvider({
  provider,
  capability,
  model,
  input = {},
  context = {},
}) {
  const runtime = await loadProviderRuntime(provider);

  if (typeof runtime.execute !== "function") {
    throw new Error(`Invalid provider runtime: ${provider}`);
  }

  return runtime.execute({
    capability,
    model,
    context,
    credential_id: context?.credential_id || null,
    ...input,
  });
}

export async function getProviderStatus({
  provider,
  job_id,
  input = {},
  context = {},
}) {
  if (!provider) {
    throw new Error("provider required");
  }

  if (!job_id) {
    throw new Error("job_id required");
  }

  const runtime = await loadProviderRuntime(provider);
  const statusFunction =
    runtime.getStatus ||
    runtime.poll ||
    runtime.status;

  if (typeof statusFunction !== "function") {
    throw new Error(`Provider status runtime unavailable: ${provider}`);
  }

  return statusFunction.call(runtime, {
    job_id,
    provider_job_id: job_id,
    credential_id: context?.credential_id || null,
    context,
    ...input,
  });
}

export const ProviderExecutor = {
  executeProvider,
  getProviderStatus,
  loadProviderRuntime,
};
