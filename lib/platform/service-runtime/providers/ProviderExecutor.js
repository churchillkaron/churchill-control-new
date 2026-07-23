import {
  getProvider,
} from "./ProviderRegistry.js";

import {
  CreativeProviderInputRuntime,
} from "@/lib/creative/production/contracts/CreativeProviderInputRuntime";

import {
  CreativeShotDirectionEnrichmentRuntime,
} from "@/lib/creative/production/contracts/CreativeShotDirectionEnrichmentRuntime";

import {
  compileCreativeShotBlockingContract,
  assertCreativeShotBlockingContract,
} from "@/lib/creative/production/contracts/CreativeShotBlockingContract";

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

function referenceRoles(asset = {}) {
  return [
    ...list(asset.reference_roles),
    ...list(asset.reference_role),
    ...list(asset.roles),
    ...list(asset.role),
    ...list(asset.metadata?.reference_roles),
    ...list(asset.metadata?.reference_role),
    ...list(asset.metadata?.roles),
    ...list(asset.metadata?.role),
  ].map((value) => String(value).toUpperCase());
}

function hasRole(asset, pattern) {
  return referenceRoles(asset).some((role) => pattern.test(role));
}

function isCreativeMasterStill(capability, input = {}) {
  return (
    capability === "ai.image.generate" &&
    Boolean(
      input.production_task_id ||
      input.specification?.shot ||
      input.generation_contract ||
      String(input.mode || "").startsWith("creative_") ||
      [
        "reference_grounded_master_still",
        "reference_grounded_full_scene_synthesis",
      ].includes(String(input.mode || "")),
    )
  );
}

function prepareCreativeBlockingInput(capability, input = {}) {
  if (!isCreativeMasterStill(capability, input)) return input;

  const specification = input.specification || {};
  const contract = compileCreativeShotBlockingContract({
    scene: specification.scene || {},
    shot: specification.shot || {},
  });

  assertCreativeShotBlockingContract(contract);

  return {
    ...input,
    specification: {
      ...specification,
      shot: {
        ...(specification.shot || {}),
        blocking_contract: contract,
      },
      blocking_contract: contract,
    },
    blocking_contract: contract,
    prompt: [
      input.prompt || "",
      "AUTHORITATIVE SHOT BLOCKING CONTRACT:",
      JSON.stringify(contract),
      "Render exactly one decisive still frame that makes the declared story action immediately readable without captions. Narrative roles, subject paths, body orientation, gaze, interaction targets, screen direction, opening state, closing state and forbidden interpretations are mandatory. Do not reverse travel direction, merge opposing actions, turn staff into customers, turn arrival into departure, or substitute attractive posing for the declared story beat. Camera language describes framing only and may never override human blocking.",
    ].filter(Boolean).join("\n\n"),
  };
}

async function validateImageReference(asset = {}, index = 0) {
  const url = assetUrl(asset);

  if (!url) {
    return {
      valid: false,
      asset,
      index,
      reason: "REFERENCE_URL_REQUIRED",
    };
  }

  if (String(url).startsWith("data:image/")) {
    return {
      valid: true,
      asset,
      index,
      content_type: String(url).slice(5, String(url).indexOf(";")),
    };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return {
      valid: false,
      asset,
      index,
      reason: "REFERENCE_URL_INVALID",
    };
  }

  if (parsed.protocol !== "https:") {
    return {
      valid: false,
      asset,
      index,
      reason: "REFERENCE_IMAGE_HTTPS_REQUIRED",
    };
  }

  try {
    const response = await fetch(parsed, {
      method: "GET",
      headers: {
        Range: "bytes=0-1023",
      },
      signal: AbortSignal.timeout(30000),
    });
    const contentType = String(
      response.headers.get("content-type") || "",
    ).toLowerCase();

    if (!response.ok) {
      return {
        valid: false,
        asset,
        index,
        reason: `REFERENCE_IMAGE_DOWNLOAD_FAILED_${response.status}`,
        status: response.status,
        content_type: contentType || null,
      };
    }

    if (!contentType.startsWith("image/")) {
      return {
        valid: false,
        asset,
        index,
        reason: "REFERENCE_ASSET_IS_NOT_AN_IMAGE",
        status: response.status,
        content_type: contentType || null,
      };
    }

    return {
      valid: true,
      asset,
      index,
      status: response.status,
      content_type: contentType,
    };
  } catch (error) {
    return {
      valid: false,
      asset,
      index,
      reason: error?.message || "REFERENCE_IMAGE_VALIDATION_FAILED",
    };
  }
}

async function prepareImageGenerationReferences(capability, input = {}) {
  if (capability !== "ai.image.generate") return input;

  const assets = selectedAssets(input.assets);
  if (!assets.length) return input;

  const validation = await Promise.all(
    assets.map(validateImageReference),
  );
  const accepted = validation
    .filter((result) => result.valid)
    .map((result) => result.asset);
  const rejected = validation
    .filter((result) => !result.valid)
    .map((result) => ({
      index: result.index,
      asset_id:
        result.asset?.id || result.asset?.asset_id || null,
      reason: result.reason,
      status: result.status || null,
      content_type: result.content_type || null,
    }));

  if (!accepted.length) {
    const error = new Error("NO_VALID_REFERENCE_IMAGES");
    error.code = "NO_VALID_REFERENCE_IMAGES";
    error.details = { rejected };
    throw error;
  }

  const requestedVenue = assets.some((asset) =>
    hasRole(asset, /VENUE|SOURCE_PLATE/),
  );
  const requestedBrand = assets.some((asset) =>
    hasRole(asset, /BRAND|LOGO/),
  );
  const acceptedVenue = accepted.some((asset) =>
    hasRole(asset, /VENUE|SOURCE_PLATE/),
  );
  const acceptedBrand = accepted.some((asset) =>
    hasRole(asset, /BRAND|LOGO/),
  );

  if (requestedVenue && !acceptedVenue) {
    const error = new Error("VALID_VENUE_REFERENCE_REQUIRED");
    error.code = "VALID_VENUE_REFERENCE_REQUIRED";
    error.details = { rejected };
    throw error;
  }

  if (requestedBrand && !acceptedBrand) {
    const error = new Error("VALID_BRAND_REFERENCE_REQUIRED");
    error.code = "VALID_BRAND_REFERENCE_REQUIRED";
    error.details = { rejected };
    throw error;
  }

  return {
    ...input,
    assets: Array.isArray(input.assets)
      ? accepted
      : {
          ...(input.assets || {}),
          selectedAssets: accepted,
        },
    reference_validation: {
      requested_count: assets.length,
      accepted_count: accepted.length,
      rejected_count: rejected.length,
      rejected,
      venue_preserved: requestedVenue ? acceptedVenue : null,
      brand_preserved: requestedBrand ? acceptedBrand : null,
    },
  };
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

  const blockingContract =
    input.blocking_contract ||
    input.specification?.blocking_contract ||
    input.specification?.shot?.blocking_contract ||
    null;

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
      blockingContract
        ? `AUTHORITATIVE SHOT BLOCKING CONTRACT: ${JSON.stringify(blockingContract)}`
        : "No authoritative shot blocking contract was supplied; fail brief accuracy because story action, screen direction and actor roles cannot be verified.",
      "Explicitly verify narrative role readability, declared action, start-to-end travel direction, body orientation, gaze, interaction target, screen direction, decisive moment and every forbidden interpretation. A visually attractive image must fail when action reads as the opposite event, arrival reads as departure, staff and customer roles are ambiguous, or subjects merely pose instead of performing the story.",
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
  const directionPreparedInput =
    await CreativeShotDirectionEnrichmentRuntime.prepare({
      capability,
      input: creativeInput,
      context,
    });
  const blockingPreparedInput = prepareCreativeBlockingInput(
    capability,
    directionPreparedInput,
  );
  const imagePreparedInput =
    await prepareImageGenerationReferences(
      capability,
      blockingPreparedInput,
    );
  const preparedInput = await prepareMasterStillQaInput(
    capability,
    imagePreparedInput,
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
