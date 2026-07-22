import {
  getProvider,
} from "./ProviderRegistry.js";

import {
  CreativeProviderInputRuntime,
} from "@/lib/creative/production/contracts/CreativeProviderInputRuntime";

import {
  CreativeVisualEvidenceBoardRuntime,
} from "@/lib/creative/quality/runtime/CreativeVisualEvidenceBoardRuntime";

const RUNTIME_LOADERS = {
  linkedin: () =>
    import("./linkedin/LinkedInProvider")
      .then((module) => module.LinkedInProvider),
  line: () =>
    import("./line/LINEProvider")
      .then((module) => module.LINEProvider),
  whatsapp: () =>
    import("./whatsapp/WhatsAppProvider")
      .then((module) => module.WhatsAppProvider),
  google: () =>
    import("./google/GoogleProvider")
      .then((module) => module.GoogleProvider),
  meta: () =>
    import("./meta/MetaProvider")
      .then((module) => module.MetaProvider),
  openai: () =>
    import("./openai/OpenAIProvider")
      .then((module) => module.OpenAIProvider),
  flux: () =>
    import("./flux/FluxProvider")
      .then((module) => module.FluxProvider),
  runway: () =>
    import("./runway/RunwayProvider")
      .then((module) => module.RunwayProvider),
  fal: () =>
    import("./fal/FalAudioProvider")
      .then((module) => module.FalAudioProvider),
};

function managedProvider(providerId) {
  if (providerId !== "fal") return null;

  return {
    id: "fal",
    runtime: "fal",
    runtimeAvailable: true,
    active: true,
  };
}

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function selectedAssets(assets = {}) {
  if (Array.isArray(assets)) return assets.filter(Boolean);
  return list(assets.selectedAssets);
}

function assetUrl(asset = {}) {
  return (
    asset.image_url ||
    asset.file_url ||
    asset.url ||
    asset.thumbnail_url ||
    null
  );
}

async function prepareMasterStillQaInput(capability, input = {}) {
  if (
    capability !== "ai.image.analyze" ||
    String(input.mode || "") !== "creative_master_still_qa"
  ) {
    return input;
  }

  const assets = selectedAssets(input.assets);
  const generatedImage =
    input.image ||
    input.source_image ||
    assetUrl(assets[0] || {});

  if (!generatedImage) {
    throw new Error("CREATIVE_QA_GENERATED_IMAGE_REQUIRED");
  }

  const references = assets.filter((asset) =>
    assetUrl(asset) &&
    String(assetUrl(asset)) !== String(generatedImage),
  );
  const evidence = await CreativeVisualEvidenceBoardRuntime.prepare({
    generated_image: generatedImage,
    assets: references,
  });

  if (
    evidence.evidence_board_created !== true ||
    Number(evidence.reference_count || 0) < 1
  ) {
    const error = new Error("CREATIVE_QA_VISUAL_REFERENCES_REQUIRED");
    error.code = "CREATIVE_QA_VISUAL_REFERENCES_REQUIRED";
    error.details = evidence;
    throw error;
  }

  return {
    ...input,
    image: evidence.image,
    source_image: evidence.image,
    assets: {
      selectedAssets: references,
    },
    prompt: [
      input.prompt || "",
      "The supplied image is one labelled visual evidence board. The large first panel is the generated master still. Every lower panel is an original reference image. Compare their visible pixels directly and fail closed when identity, venue, product, brand, anatomy, realism, brief accuracy, or commercial craft cannot be verified.",
    ].filter(Boolean).join("\n\n"),
    visual_evidence_board: {
      created: true,
      reference_count: evidence.reference_count,
      manifest: evidence.manifest,
    },
  };
}

export async function loadProviderRuntime(providerId) {
  const provider =
    getProvider(providerId) ||
    managedProvider(providerId);

  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  if (provider.runtimeAvailable === false) {
    throw new Error(
      `Provider runtime unavailable: ${providerId}`,
    );
  }

  const loader = RUNTIME_LOADERS[provider.runtime];

  if (!loader) {
    throw new Error(
      `No runtime loader for ${provider.runtime}`,
    );
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
    throw new Error(
      `Invalid provider runtime: ${provider}`,
    );
  }

  const creativeInput = CreativeProviderInputRuntime.prepare({
    capability,
    input,
  });
  const preparedInput = await prepareMasterStillQaInput(
    capability,
    creativeInput,
  );

  return runtime.execute({
    capability,
    model,
    context,
    credential_id: context?.credential_id || null,
    ...preparedInput,
  });
}

export const ProviderExecutor = {
  executeProvider,
  loadProviderRuntime,
};
