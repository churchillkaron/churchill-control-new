import "./avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js";
import "./avantiqo-image/AvantiqoImageProviderRegistration.js";
import "./avantiqo-video/AvantiqoVideoProviderRegistration.js";
import "./avantiqo-audio/AvantiqoAudioProviderRegistration.js";
import "./avantiqo-code/AvantiqoCodeProviderRegistration.js";
import "./lipsync/ManagedLipSyncProviderRegistration";
import "./meta/ManagedMetaCredentialRegistration";
import "./google/GoogleCredentialRegistration.js";
import "./google/GoogleProviderRegistration.js";
import "./email/EmailProviderRegistration.js";
import "./shopify/ShopifyProviderRegistration.js";
import "./threads/ThreadsProviderRegistration.js";
import "./x/XProviderRegistration.js";
import "./tiktok/TikTokProviderRegistration.js";
import "./tripadvisor/TripadvisorProviderRegistration.js";
import "./gemini/ManagedGeminiCredentialRegistration.js";
import "./gemini/GeminiProviderRegistration.js";
import "./openai/ManagedOpenAICredentialRegistration.js";
import "./fal/FalProviderRegistration.js";

import { getProvider } from "./ProviderRegistry.js";
import { resolveProviderCredential } from "./ProviderCredentialRuntime";
import {
  serializeCreativeProviderInstruction,
  hasStructuredCreativeInstruction,
} from "@/lib/creative/execution/runtime/CreativeProviderInstructionSerializer";
import { prepareRunwayProviderInputByProbe } from "./runway/RunwayProviderMediaProbeRuntime";
import { prepareOpenAIVideoAnalysisInput } from "./openai/OpenAIVideoAnalysisFrameRuntime";
import { assertProviderExecutionFunded } from "@/lib/platform/service-runtime/execution/ProviderExecutionFundingGuard";
import { isAvantiqoOwnedProvider } from "./AvantiqoOwnedProviderPolicy.js";

const RESERVED_BUSINESS_INPUT_KEYS = new Set([
  "assets",
  "capability",
  "context",
  "credential",
  "credential_id",
  "generation",
  "image",
  "instructions",
  "media",
  "media_kind",
  "mediaKind",
  "media_policy",
  "mediaPolicy",
  "model",
  "openai_video_analysis_frame_contract",
  "payload",
  "prompt",
  "provider_parameters",
  "providerParameters",
  "provider_prompt",
  "reference_images",
  "referenceImages",
  "requirements",
  "source",
  "video",
]);

const RUNTIME_LOADERS = {
  avantiqo_intelligence: () =>
    import("./avantiqo-intelligence/AvantiqoIntelligenceProvider.js")
      .then(module => module.AvantiqoIntelligenceProvider),
  avantiqo_image: () =>
    import("./avantiqo-image/AvantiqoImageProvider.js")
      .then(module => module.AvantiqoImageProvider),
  avantiqo_video: () =>
    import("./avantiqo-video/AvantiqoVideoProvider.js")
      .then(module => module.AvantiqoVideoProvider),
  avantiqo_audio: () =>
    import("./avantiqo-audio/AvantiqoAudioProvider.js")
      .then(module => module.AvantiqoAudioProvider),
  avantiqo_code: () =>
    import("./avantiqo-code/AvantiqoCodeProvider.js")
      .then(module => module.AvantiqoCodeProvider),
  email_google: () => import("./email/EmailUnifiedProvider.js").then(module => module.GoogleEmailUnifiedProvider),
  email_microsoft: () => import("./email/EmailUnifiedProvider.js").then(module => module.MicrosoftEmailUnifiedProvider),
  email_imap: () => import("./email/EmailUnifiedProvider.js").then(module => module.ImapEmailUnifiedProvider),
  shopify: () => import("./shopify/ShopifyProvider.js").then(module => module.ShopifyProvider),
  threads: () => import("./threads/ThreadsProvider.js").then(module => module.ThreadsProvider),
  x: () => import("./x/XProvider.js").then(module => module.XProvider),
  tiktok: () => import("./tiktok/TikTokProvider.js").then(module => module.TikTokProvider),
  tripadvisor: () => import("./tripadvisor/TripadvisorProvider.js").then(module => module.TripadvisorProvider),
  linkedin: () => import("./linkedin/LinkedInProvider").then(module => module.LinkedInProvider),
  line: () => import("./line/LINEProvider").then(module => module.LINEProvider),
  whatsapp: () => import("./whatsapp/WhatsAppProvider").then(module => module.WhatsAppProvider),
  google: () => import("./google/GoogleProvider").then(module => module.GoogleProvider),
  google_ads_managed: () => import("./google/GoogleAdsManagedProvider").then(module => module.GoogleAdsManagedProvider),
  gemini: () => import("./gemini/GeminiApprovedDependencyFrameProvider.js").then(module => module.GeminiApprovedDependencyFrameProvider),
  google_veo: () => import("./gemini/GeminiVeoProviderRuntime.js").then(module => module.GeminiVeoProviderRuntime),
  meta: () => import("./meta/MetaProvider").then(module => module.MetaProvider),
  openai: () => import("./openai/OpenAIProviderSanitizedRuntime").then(module => module.OpenAIProvider),
  flux: () => import("./flux/FluxProvider").then(module => module.FluxProvider),
  runway: () => import("./runway/RunwayProvider").then(module => module.RunwayProvider),
  fal: () => import("./fal/FalProvider.js").then(module => module.FalProvider),
  grok: () => import("./grok/GrokProvider.js").then(module => module.GrokProvider),
  seedance: () => import("./seedance/SeedanceProvider.js").then(module => module.SeedanceProvider),
  veo: () => import("./veo/VeoProvider.js").then(module => module.VeoProvider),
  managed_lipsync: () => import("./lipsync/ManagedLipSyncProvider").then(module => module.ManagedLipSyncProvider),
};

function value(value) {
  return String(value ?? "").trim();
}

function credentialOverlay(credential = null) {
  if (!credential || typeof credential !== "object" || Array.isArray(credential)) return {};
  return Object.fromEntries(
    Object.entries(credential).filter(([key]) => !RESERVED_BUSINESS_INPUT_KEYS.has(key)),
  );
}

function credentialCollisionKeys(credential = null) {
  if (!credential || typeof credential !== "object" || Array.isArray(credential)) return [];
  return Object.keys(credential)
    .filter((key) => RESERVED_BUSINESS_INPUT_KEYS.has(key))
    .sort();
}

function assertGovernedGeminiExecution({ provider, context = {}, preparedInput = {} }) {
  if (!new Set(["gemini", "google-veo"]).has(provider)) return;
  if (!value(context.organization_id) || !value(context.organization_service_id) || !value(context.usage_id)) {
    throw new Error("GEMINI_GOVERNED_SERVICE_EXECUTION_REQUIRED");
  }
  const contract = preparedInput.prompt_serialization_contract || {};
  if (
    contract.contract !== "CREATIVE_PROVIDER_INSTRUCTION_SERIALIZATION_V1" ||
    contract.boundary !== "EXECUTION_TRANSPORT_ONLY" ||
    contract.persisted !== false
  ) {
    throw new Error("GEMINI_PROVIDER_INSTRUCTION_SERIALIZATION_REQUIRED");
  }
}

function assertGovernedOpenAIExecution({ provider, context = {}, preparedInput = {} }) {
  if (provider !== "openai") return;
  if (!value(context.organization_id) || !value(context.organization_service_id) || !value(context.usage_id)) {
    throw new Error("OPENAI_AVANTIQO_GOVERNED_SERVICE_EXECUTION_REQUIRED");
  }
  const credential = preparedInput.credential || {};
  if (
    value(credential.managed_by).toUpperCase() !== "AVANTIQO" ||
    value(credential.credential_purpose).toUpperCase() !== "AVANTIQO_MANAGED_AI" ||
    value(credential.api_family).toUpperCase() !== "OPENAI_API" ||
    !value(credential.api_key) ||
    !value(preparedInput.credential_id)
  ) {
    throw new Error("OPENAI_AVANTIQO_MANAGED_CREDENTIAL_REQUIRED");
  }
  const transport = preparedInput.provider_credential_transport_contract || {};
  if (
    transport.contract !== "PROVIDER_CREDENTIAL_BUSINESS_INPUT_ISOLATION_V1" ||
    transport.reserved_business_input_keys_protected !== true
  ) {
    throw new Error("OPENAI_AVANTIQO_CREDENTIAL_ISOLATION_REQUIRED");
  }
}

function assertGovernedAvantiqoOwnedExecution({ provider, context = {}, preparedInput = {} }) {
  if (!isAvantiqoOwnedProvider(provider)) return;
  if (!value(context.organization_id) || !value(context.organization_service_id) || !value(context.usage_id)) {
    throw new Error("AVANTIQO_OWNED_ENGINE_GOVERNED_SERVICE_EXECUTION_REQUIRED");
  }
  if (provider === "avantiqo-intelligence") return;

  if (hasStructuredCreativeInstruction(preparedInput)) {
    const contract = preparedInput.prompt_serialization_contract || {};
    if (
      contract.contract !== "CREATIVE_PROVIDER_INSTRUCTION_SERIALIZATION_V1" ||
      contract.boundary !== "EXECUTION_TRANSPORT_ONLY" ||
      contract.persisted !== false
    ) {
      throw new Error("AVANTIQO_OWNED_ENGINE_INSTRUCTION_SERIALIZATION_REQUIRED");
    }
  }
}

export async function loadProviderRuntime(providerId) {
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);
  if (provider.runtimeAvailable === false) throw new Error(`Provider runtime unavailable: ${providerId}`);
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
  const providerPayload = {
    ...input,
    ...(credential?.login_customer_id && !input?.login_customer_id
      ? { login_customer_id: credential.login_customer_id }
      : {}),
  };
  const safeCredentialOverlay = credentialOverlay(credential);
  const collisions = credentialCollisionKeys(credential);
  const selectedCredentialId = credential?.credential_id || context?.credential_id || null;

  const structuredInput = {
    ...input,
    capability,
    model,
    ...safeCredentialOverlay,
    payload: providerPayload,
    credential: credential || null,
    context: { ...context, credential_id: selectedCredentialId },
    credential_id: selectedCredentialId,
    provider_credential_transport_contract: {
      contract: "PROVIDER_CREDENTIAL_BUSINESS_INPUT_ISOLATION_V1",
      reserved_business_input_keys_protected: true,
      credential_collision_count: collisions.length,
      credential_collision_keys: collisions,
    },
  };

  if (!hasStructuredCreativeInstruction(structuredInput)) return structuredInput;
  const instruction = serializeCreativeProviderInstruction(structuredInput);
  return {
    ...structuredInput,
    prompt: instruction,
    provider_prompt: instruction,
    prompt_serialization_contract: {
      contract: "CREATIVE_PROVIDER_INSTRUCTION_SERIALIZATION_V1",
      boundary: "EXECUTION_TRANSPORT_ONLY",
      persisted: false,
    },
  };
}

async function preparedProviderInput({ provider, capability, model, input, context, credential }) {
  const structured = providerInput({ capability, model, input, context, credential });
  if (provider === "runway") return prepareRunwayProviderInputByProbe(structured);
  if (provider === "openai" && capability === "ai.image.analyze") {
    return prepareOpenAIVideoAnalysisInput(structured);
  }
  return structured;
}

export async function prepareProviderInputForExecution({
  provider,
  capability,
  model = null,
  input = {},
  context = {},
}) {
  const credential = await executionCredential(provider, context);
  return preparedProviderInput({ provider, capability, model, input, context, credential });
}

export async function executeProvider({ provider, capability, model, input = {}, context = {} }) {
  await assertProviderExecutionFunded({ provider, context });
  const runtime = await loadProviderRuntime(provider);
  if (typeof runtime.execute !== "function") throw new Error(`Invalid provider runtime: ${provider}`);

  const preparedInput = await prepareProviderInputForExecution({ provider, capability, model, input, context });
  assertGovernedGeminiExecution({ provider, context, preparedInput });
  assertGovernedOpenAIExecution({ provider, context, preparedInput });
  assertGovernedAvantiqoOwnedExecution({ provider, context, preparedInput });
  return runtime.execute(preparedInput);
}

export async function getProviderStatus({ provider, job_id, input = {}, context = {} }) {
  if (!provider) throw new Error("provider required");
  if (!job_id) throw new Error("job_id required");

  await assertProviderExecutionFunded({ provider, context });
  const runtime = await loadProviderRuntime(provider);
  const statusFunction = runtime.getStatus || runtime.poll || runtime.status;
  if (typeof statusFunction !== "function") {
    throw new Error(`Provider status runtime unavailable: ${provider}`);
  }

  const credential = await executionCredential(provider, context);
  const safeCredentialOverlay = credentialOverlay(credential);
  const selectedCredentialId = credential?.credential_id || context?.credential_id || null;

  return statusFunction.call(runtime, {
    ...input,
    job_id,
    provider_job_id: job_id,
    ...safeCredentialOverlay,
    payload: input,
    credential: credential || null,
    context: { ...context, credential_id: selectedCredentialId },
    credential_id: selectedCredentialId,
    provider_credential_transport_contract: {
      contract: "PROVIDER_CREDENTIAL_BUSINESS_INPUT_ISOLATION_V1",
      reserved_business_input_keys_protected: true,
      credential_collision_count: credentialCollisionKeys(credential).length,
      credential_collision_keys: credentialCollisionKeys(credential),
    },
  });
}

export const ProviderExecutor = {
  executeProvider,
  getProviderStatus,
  loadProviderRuntime,
  prepareProviderInputForExecution,
};
