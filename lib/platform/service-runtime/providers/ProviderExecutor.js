import "./lipsync/ManagedLipSyncProviderRegistration";
import "./fal/FalProviderRegistration";

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
  meta: () => import("./meta/MetaProvider").then((module) => module.MetaProvider),
  openai: () => import("./openai/OpenAIProviderSanitizedRuntime").then((module) => module.OpenAIProvider),
  flux: () => import("./flux/FluxProvider").then((module) => module.FluxProvider),
  fal: () => import("./fal/FalProvider").then((module) => module.FalProvider),
  runway: () => import("./runway/RunwayProvider").then((module) => module.RunwayProvider),
  managed_lipsync: () => import("./lipsync/ManagedLipSyncProvider").then((module) => module.ManagedLipSyncProvider),
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
    payload: input,
    ...(credential || {}),
    credential: credential || null,
    context,
    credential_id: context?.credential_id || null,
  };
}

export async function assertProviderReady({
  provider,
  capability,
  model,
  input = {},
  context = {},
}) {
  const runtime = await loadProviderRuntime(provider);
  const credential = await executionCredential(provider, context);
  if (typeof runtime.assertReady === "function") {
    return runtime.assertReady(providerInput({
      capability,
      model,
      input,
      context,
      credential,
    }));
  }
  return {
    ready: true,
    provider,
    model: model || null,
    credential_resolved: Boolean(credential),
  };
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

  const credential = await executionCredential(provider, context);
  return runtime.execute(providerInput({
    capability,
    model,
    input,
    context,
    credential,
  }));
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
    payload: input,
    ...(credential || {}),
    credential: credential || null,
    context,
    credential_id: context?.credential_id || null,
  });
}

export const ProviderExecutor = {
  assertProviderReady,
  executeProvider,
  getProviderStatus,
  loadProviderRuntime,
};
