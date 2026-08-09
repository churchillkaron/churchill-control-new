import "./lipsync/ManagedLipSyncProviderRegistration";
import "./meta/ManagedMetaCredentialRegistration";
import "./google/GoogleCredentialRegistration.js";
import "./google/GoogleProviderRegistration.js";
import "./gemini/ManagedGeminiCredentialRegistration.js";
import "./gemini/GeminiProviderRegistration.js";
import "./fal/FalProviderRegistration.js";

import {
  getProvider,
} from "./ProviderRegistry.js";
import {
  resolveProviderCredential,
} from "./ProviderCredentialRuntime";
import {
  serializeCreativeProviderInstruction,
  hasStructuredCreativeInstruction,
} from "@/lib/creative/execution/runtime/CreativeProviderInstructionSerializer";
import {
  prepareRunwayProviderInputByProbe,
} from "./runway/RunwayProviderMediaProbeRuntime";
import {
  prepareOpenAIVideoAnalysisInput,
} from "./openai/OpenAIVideoAnalysisFrameRuntime";

const RUNTIME_LOADERS = {
  linkedin: () =>
    import("./linkedin/LinkedInProvider")
      .then(
        module =>
          module.LinkedInProvider
      ),
  line: () =>
    import("./line/LINEProvider")
      .then(
        module =>
          module.LINEProvider
      ),
  whatsapp: () =>
    import("./whatsapp/WhatsAppProvider")
      .then(
        module =>
          module.WhatsAppProvider
      ),
  google: () =>
    import("./google/GoogleProvider")
      .then(
        module =>
          module.GoogleProvider
      ),
  gemini: () =>
    import("./gemini/GeminiScopedReferenceProvider.js")
      .then(
        module =>
          module.GeminiScopedReferenceProvider
      ),
  meta: () =>
    import("./meta/MetaProvider")
      .then(
        module =>
          module.MetaProvider
      ),
  openai: () =>
    import(
      "./openai/OpenAIProviderSanitizedRuntime"
    ).then(
      module =>
        module.OpenAIProvider
    ),
  flux: () =>
    import("./flux/FluxProvider")
      .then(
        module =>
          module.FluxProvider
      ),
  runway: () =>
    import("./runway/RunwayProvider")
      .then(
        module =>
          module.RunwayProvider
      ),
  fal: () =>
    import("./fal/FalProvider.js")
      .then(
        module =>
          module.FalProvider
      ),
  managed_lipsync: () =>
    import(
      "./lipsync/ManagedLipSyncProvider"
    ).then(
      module =>
        module.ManagedLipSyncProvider
    ),
};

function value(value) {
  return String(value ?? "").trim();
}

function assertGovernedGeminiExecution({
  provider,
  context = {},
  preparedInput = {},
}) {
  if (provider !== "gemini") return;

  if (
    !value(context.organization_id) ||
    !value(context.organization_service_id) ||
    !value(context.usage_id)
  ) {
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

export async function loadProviderRuntime(
  providerId
) {
  const provider =
    getProvider(providerId);

  if (!provider) {
    throw new Error(
      `Unknown provider: ${providerId}`
    );
  }

  if (
    provider.runtimeAvailable ===
    false
  ) {
    throw new Error(
      `Provider runtime unavailable: ${providerId}`
    );
  }

  const loader =
    RUNTIME_LOADERS[
      provider.runtime
    ];

  if (!loader) {
    throw new Error(
      `No runtime loader for ${provider.runtime}`
    );
  }

  return loader();
}

async function executionCredential(
  provider,
  context = {}
) {
  if (
    !context?.organization_id
  ) {
    return null;
  }

  return resolveProviderCredential({
    organization_id:
      context.organization_id,
    provider,
    credential_id:
      context.credential_id ||
      null,
  });
}

function providerInput({
  capability,
  model,
  input,
  context,
  credential,
}) {
  const structuredInput = {
    capability,
    model,
    ...input,
    payload: input,
    ...(credential || {}),
    credential:
      credential || null,
    context,
    credential_id:
      context?.credential_id ||
      null,
  };

  if (
    !hasStructuredCreativeInstruction(
      structuredInput
    )
  ) {
    return structuredInput;
  }

  const instruction =
    serializeCreativeProviderInstruction(
      structuredInput
    );

  return {
    ...structuredInput,
    prompt: instruction,
    provider_prompt:
      instruction,
    prompt_serialization_contract:
      {
        contract:
          "CREATIVE_PROVIDER_INSTRUCTION_SERIALIZATION_V1",
        boundary:
          "EXECUTION_TRANSPORT_ONLY",
        persisted: false,
      },
  };
}

async function preparedProviderInput({
  provider,
  capability,
  model,
  input,
  context,
  credential,
}) {
  const structured =
    providerInput({
      capability,
      model,
      input,
      context,
      credential,
    });

  if (provider === "runway") {
    return prepareRunwayProviderInputByProbe(
      structured
    );
  }

  if (
    provider === "openai" &&
    capability ===
      "ai.image.analyze"
  ) {
    return prepareOpenAIVideoAnalysisInput(
      structured
    );
  }

  return structured;
}

export async function executeProvider({
  provider,
  capability,
  model,
  input = {},
  context = {},
}) {
  const runtime =
    await loadProviderRuntime(
      provider
    );

  if (
    typeof runtime.execute !==
    "function"
  ) {
    throw new Error(
      `Invalid provider runtime: ${provider}`
    );
  }

  const credential =
    await executionCredential(
      provider,
      context
    );

  const preparedInput =
    await preparedProviderInput({
      provider,
      capability,
      model,
      input,
      context,
      credential,
    });

  assertGovernedGeminiExecution({
    provider,
    context,
    preparedInput,
  });

  return runtime.execute(
    preparedInput
  );
}

export async function getProviderStatus({
  provider,
  job_id,
  input = {},
  context = {},
}) {
  if (!provider) {
    throw new Error(
      "provider required"
    );
  }

  if (!job_id) {
    throw new Error(
      "job_id required"
    );
  }

  const runtime =
    await loadProviderRuntime(
      provider
    );

  const statusFunction =
    runtime.getStatus ||
    runtime.poll ||
    runtime.status;

  if (
    typeof statusFunction !==
    "function"
  ) {
    throw new Error(
      `Provider status runtime unavailable: ${provider}`
    );
  }

  const credential =
    await executionCredential(
      provider,
      context
    );

  return statusFunction.call(
    runtime,
    {
      job_id,
      provider_job_id:
        job_id,
      ...input,
      payload: input,
      ...(credential || {}),
      credential:
        credential || null,
      context,
      credential_id:
        context?.credential_id ||
        null,
    }
  );
}

export const ProviderExecutor = {
  executeProvider,
  getProviderStatus,
  loadProviderRuntime,
};