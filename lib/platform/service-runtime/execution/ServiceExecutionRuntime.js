import {
  OrganizationServiceRuntime,
} from "../services/runtime/OrganizationServiceRuntime";

import {
  resolveProvider,
} from "../providers/ProviderResolver";

import {
  executeProvider,
} from "../providers/ProviderExecutor";

import {
  PricingRuntime,
} from "../pricing/PricingRuntime";

import {
  WalletRuntime,
} from "../wallet/runtime/WalletRuntime";

import {
  UsageRuntime,
} from "../usage/UsageRuntime";

import {
  BillingRuntime,
} from "../billing/runtime/BillingRuntime";

import {
  resolveServiceCapabilities,
} from "../services/resolver/ServiceCapabilityResolver";

import {
  resolvePrimaryExecutionCapability,
} from "../services/resolver/CapabilityExecutionResolver";

import {
  prepareCreativeGenerationPayload,
} from "@/lib/creative/production/contracts/CreativeGenerationEvidenceContract";

import {
  CreativeMaskedCompositionRuntime,
} from "@/lib/creative/production/composition/CreativeMaskedCompositionRuntime";

import {
  CreativeStorageRuntime,
} from "@/lib/creative/storage/runtime/CreativeStorageRuntime";

import {
  sanitizeServiceExecutionMetadata,
} from "./ServiceExecutionMetadataSanitizer";

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? null;
}

function structuredJsonOutput(
  result = {},
) {
  const candidates = [
    result?.output?.output?.json,
    result?.output?.json,
    result?.output?.result?.json,
    result?.result?.output?.json,
    result?.result?.json,
    result?.json,
  ];

  return (
    candidates.find(
      (candidate) =>
        candidate &&
        typeof candidate === "object" &&
        !Array.isArray(candidate),
    ) ||
    null
  );
}

function resultImageUrl(result = {}) {
  const providerResult = result?.output || result || {};
  const output = providerResult?.output || providerResult || {};

  return firstValue(
    output?.image_url,
    output?.images?.[0]?.url,
    output?.image?.url,
    providerResult?.image_url,
    result?.image_url,
  );
}

function replaceResultImage(result = {}, imageUrl, evidence = null) {
  if (!imageUrl) return result;

  if (result?.output?.output && typeof result.output.output === "object") {
    return {
      ...result,
      output: {
        ...result.output,
        output: {
          ...result.output.output,
          image_url: imageUrl,
          immutable_composite: evidence,
        },
      },
    };
  }

  if (result?.output && typeof result.output === "object") {
    return {
      ...result,
      output: {
        ...result.output,
        image_url: imageUrl,
        immutable_composite: evidence,
      },
    };
  }

  return {
    ...result,
    image_url: imageUrl,
    immutable_composite: evidence,
  };
}

function maskedCompositionRequired(contract = null) {
  if (!contract?.composition?.ready) return false;

  return [
    "IMMUTABLE_PLATE_MASKED_CAST",
    "MASKED_CAST_COMPOSITE",
    "SOURCE_PLATE_WITH_APPROVED_BRAND_OVERLAY",
    "POST_COMPOSITE_EXACT_BRAND",
  ].includes(String(contract.composition.mode || "").toUpperCase());
}

function resolveAsyncJob(result = {}) {
  const providerResult = result?.output || result || {};
  const output = providerResult?.output || providerResult || {};
  const jobId = firstValue(
    output?.video_job_id,
    output?.job_id,
    output?.task_id,
    providerResult?.video_job_id,
  );
  const status = String(
    firstValue(
      output?.status,
      providerResult?.status,
      "",
    ),
  ).toUpperCase();

  if (!jobId) return null;

  return {
    job_id: jobId,
    status: status || "PROCESSING",
  };
}

function taskIdentity(metadata = {}) {
  return (
    metadata.task?.id ||
    metadata.production_task_id ||
    metadata.task_id ||
    null
  );
}

function projectIdentity(metadata = {}) {
  return (
    metadata.task?.creative_project_id ||
    metadata.creative_project_id ||
    null
  );
}

async function persistMaskedComposite({
  organization_id,
  metadata,
  immutable,
  maskedExecution,
}) {
  const assetId = taskIdentity(metadata);
  const creativeProjectId = projectIdentity(metadata);

  if (!assetId || !creativeProjectId) {
    throw new Error("CREATIVE_MASKED_STORAGE_IDENTITY_REQUIRED");
  }

  const stored = await CreativeStorageRuntime.uploadDataUrl({
    organization_id,
    creative_project_id: creativeProjectId,
    asset_id: assetId,
    data_url: immutable.data_url,
    filename: "immutable-masked-composite.png",
  });

  return {
    image_url: stored.signed_url,
    evidence: {
      mode: maskedExecution.mode,
      source_plate_asset_id:
        maskedExecution.source_plate_asset_id,
      placement_regions:
        maskedExecution.placement_regions,
      protected_regions:
        maskedExecution.protected_regions,
      edited_area_ratio:
        maskedExecution.edited_area_ratio,
      exact_pixels_outside_mask_restored:
        immutable.exact_pixels_outside_mask_restored,
      width: immutable.width,
      height: immutable.height,
      canonical_storage: true,
      storage_path: stored.storage_path,
      checksum: stored.checksum,
      byte_size: stored.byte_size,
      content_type: stored.content_type,
    },
  };
}

async function completeUsage({
  organization_id,
  usage_id,
  provider,
  model,
  pricing,
  quantity,
  unit,
  metadata,
  result,
  started_at,
}) {
  const completedUsage = await UsageRuntime.complete({
    usage_id,
    supplier_cost: pricing.supplier_cost,
    platform_markup: pricing.platform_markup,
    customer_price: pricing.customer_price,
    quantity,
    unit,
    latency_ms:
      started_at
        ? Date.now() - Number(started_at)
        : null,
    metadata: sanitizeServiceExecutionMetadata({
      ...metadata,
      model,
      result,
    }),
  });

  await WalletRuntime.charge({
    organization_id,
    amount: pricing.customer_price,
    provider,
    usage_id: completedUsage.id,
    reference: completedUsage.id,
  });

  const billing = await BillingRuntime.billUsage({
    usage_id: completedUsage.id,
  });

  return {
    usage: billing.usage,
    billing,
  };
}

export async function executeService(input = {}) {
  const {
    organization_id,
    party_id = null,
    entity_id = null,
    service_id,
    provider_id,
    input: rawPayload = {},
    metadata: rawMetadata = {},
    category = "SERVICE",
    preserve_structured_output = false,
  } = input;

  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!service_id) {
    throw new Error("service_id required");
  }

  const prepared = prepareCreativeGenerationPayload({
    service_id,
    payload: rawPayload,
    metadata: rawMetadata,
  });
  let payload = prepared.payload;
  let maskedExecution = null;

  if (maskedCompositionRequired(prepared.contract)) {
    const masked = await CreativeMaskedCompositionRuntime.prepare({
      payload,
      contract: prepared.contract,
    });
    payload = masked.payload;
    maskedExecution = masked.execution;
  }

  const metadata = {
    ...rawMetadata,
    creative_generation_contract:
      prepared.contract ||
      rawMetadata.creative_generation_contract ||
      null,
    creative_masked_composition: maskedExecution,
  };
  const compactMetadata = sanitizeServiceExecutionMetadata(metadata);

  const organizationService = await OrganizationServiceRuntime.get({
    organization_id,
    service_id,
  });

  if (!organizationService) {
    throw new Error(
      `Service ${service_id} is not enabled for organization`,
    );
  }

  const serviceCapabilities = resolveServiceCapabilities(service_id);

  if (!serviceCapabilities) {
    throw new Error(
      `No capability mapping found for service ${service_id}`,
    );
  }

  if (!serviceCapabilities.capabilities?.length) {
    throw new Error(
      `Service ${service_id} has no enabled capabilities`,
    );
  }

  const executionCapability = resolvePrimaryExecutionCapability(
    serviceCapabilities.capabilities,
  );

  if (!executionCapability) {
    throw new Error(
      `No execution capability found for ${service_id}`,
    );
  }

  const selectedProvider = await resolveProvider({
    organization_id,
    capability: executionCapability,
    preferredProvider: provider_id,
    country: input.country || null,
    currency: input.currency || null,
  });

  const provider = selectedProvider.provider;
  const model = selectedProvider.model;

  const pricing = await PricingRuntime.resolve({
    provider,
    model,
    capability: executionCapability,
    country: input.country || null,
    currency: input.currency || null,
  });

  const quantity = input.quantity || 1;
  const unit = pricing.unit || "request";

  const usage = await UsageRuntime.start({
    organization_id,
    bill_to_organization_id:
      input.bill_to_organization_id || organization_id,
    party_id,
    entity_id,
    organization_service_id: organizationService.id,
    pricing_id: pricing.pricing_id,
    category,
    provider,
    capability: executionCapability,
    operation: executionCapability,
    currency: pricing.currency,
    quantity,
    unit,
    metadata: {
      ...compactMetadata,
      model,
      execution_stage: "USAGE_CREATED",
    },
  });

  await WalletRuntime.reserve({
    organization_id,
    amount: pricing.customer_price,
    provider,
    reference: usage.id,
  });

  const startedAt = Date.now();

  try {
    let result = await executeProvider({
      provider,
      capability: executionCapability,
      model,
      input: payload,
      context: {
        organization_id,
        party_id,
        entity_id,
        credential_id:
          selectedProvider.credential_id || null,
        organization_service_id:
          organizationService.id,
        country: input.country || null,
        currency: pricing.currency,
      },
    });

    if (maskedExecution) {
      const generatedImage = resultImageUrl(result);
      if (!generatedImage) {
        throw new Error(
          "CREATIVE_MASKED_PROVIDER_OUTPUT_IMAGE_REQUIRED",
        );
      }

      const immutable = await CreativeMaskedCompositionRuntime
        .enforceImmutablePlate({
          source_image: maskedExecution.source_image_data_url,
          generated_image: generatedImage,
          mask_data_url: maskedExecution.mask_data_url,
        });
      const canonical = await persistMaskedComposite({
        organization_id,
        metadata: rawMetadata,
        immutable,
        maskedExecution,
      });

      result = replaceResultImage(
        result,
        canonical.image_url,
        canonical.evidence,
      );
    }

    const asyncJob = resolveAsyncJob(result);

    if (asyncJob) {
      return {
        success: true,
        async: true,
        provider,
        model,
        pricing,
        usage,
        billing: null,
        structured_output:
          preserve_structured_output
            ? structuredJsonOutput(result)
            : null,
        output:
          sanitizeServiceExecutionMetadata(
            result,
          ),
        async_job: asyncJob,
        async_context: {
          organization_id,
          usage_id: usage.id,
          provider,
          model,
          pricing,
          quantity,
          unit,
          metadata: compactMetadata,
          preserve_structured_output,
          started_at: startedAt,
        },
      };
    }

    const completed = await completeUsage({
      organization_id,
      usage_id: usage.id,
      provider,
      model,
      pricing,
      quantity,
      unit,
      metadata: compactMetadata,
      result,
      started_at: startedAt,
    });

    return {
      success: true,
      async: false,
      provider,
      model,
      pricing,
      usage: completed.usage,
      billing: completed.billing,
      structured_output:
        preserve_structured_output
          ? structuredJsonOutput(result)
          : null,
      output:
        sanitizeServiceExecutionMetadata(
          result,
        ),
    };
  } catch (error) {
    await UsageRuntime.fail({
      usage_id: usage.id,
      error,
      latency_ms: Date.now() - startedAt,
      metadata: sanitizeServiceExecutionMetadata({
        ...compactMetadata,
        execution_stage: "EXECUTION_FAILED",
        failure_code: error?.code || null,
      }),
    }).catch(() => null);

    await WalletRuntime.release({
      organization_id,
      amount: pricing.customer_price,
      provider,
      reference: usage.id,
    });

    throw error;
  }
}

export async function completeAsyncExecution({
  submission,
  result,
}) {
  const context = submission?.async_context;

  if (!context?.usage_id) {
    throw new Error("async execution context required");
  }

  const completed = await completeUsage({
    ...context,
    result,
  });

  return {
    success: true,
    provider: context.provider,
    model: context.model,
    pricing: context.pricing,
    usage: completed.usage,
    billing: completed.billing,
    structured_output:
      context.preserve_structured_output
        ? structuredJsonOutput(result)
        : null,
    output:
      sanitizeServiceExecutionMetadata(
        result,
      ),
  };
}

export async function failAsyncExecution({
  submission,
  error,
}) {
  const context = submission?.async_context;

  if (!context?.usage_id) {
    return null;
  }

  await UsageRuntime.fail({
    usage_id: context.usage_id,
    error,
    latency_ms:
      context.started_at
        ? Date.now() - Number(context.started_at)
        : null,
    metadata: sanitizeServiceExecutionMetadata(
      context.metadata || {},
    ),
  }).catch(() => null);

  await WalletRuntime.release({
    organization_id: context.organization_id,
    amount: context.pricing.customer_price,
    provider: context.provider,
    reference: context.usage_id,
  });

  return {
    success: false,
    released: true,
  };
}

export const ServiceExecutionRuntime = {
  execute: executeService,
  completeAsync: completeAsyncExecution,
  failAsync: failAsyncExecution,
};
