import {
  getProviderPricing,
  getProviderPricingById,
} from "./repositories/ProviderPricingRepository";
import {
  getPricingExecutionContext,
} from "./PricingExecutionContextRuntime";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function calculateMarkup({
  cost,
  markup_percent = 0,
}) {
  return Number(
    (
      Number(cost) *
      (
        1 +
        (
          Number(markup_percent) /
          100
        )
      )
    )
    .toFixed(6),
  );
}

function isTokenPriced(pricing = {}) {
  return (
    finite(pricing.input_cost_per_1m) > 0 ||
    finite(pricing.output_cost_per_1m) > 0
  );
}

function effectiveUsage(usage = {}) {
  const context = getPricingExecutionContext();
  const contextualUsage = object(context.pricing_usage);
  return {
    ...contextualUsage,
    ...object(usage),
    pricing_dimensions: {
      ...object(contextualUsage.pricing_dimensions),
      ...object(usage.pricing_dimensions),
    },
  };
}

function normalizedResolution(value) {
  const normalized = text(value).toLowerCase();
  if (["4k", "2160p", "3840x2160", "2160x3840"].includes(normalized)) {
    return "4k";
  }
  if (["1080p", "1920x1080", "1080x1920"].includes(normalized)) {
    return "1080p";
  }
  if (["720p", "1280x720", "720x1280"].includes(normalized)) {
    return "720p";
  }
  return normalized || null;
}

function pricingResolution(pricing = {}, usage = {}) {
  const metadata = object(pricing.metadata);
  return normalizedResolution(
    usage.resolution ||
    usage.pricing_dimensions?.resolution ||
    metadata.default_resolution ||
    metadata.resolution,
  );
}

function unitCostForUsage(pricing = {}, usage = {}) {
  const baseCost = finite(pricing.cost_per_unit, 0);
  if (baseCost <= 0) {
    return {
      unit_cost: 0,
      unit_cost_multiplier: 1,
      resolution: pricingResolution(pricing, usage),
    };
  }

  const metadata = object(pricing.metadata);
  const multipliers = object(
    metadata.cost_per_unit_multiplier_by_resolution ||
    metadata.unit_cost_multiplier_by_resolution,
  );
  const resolution = pricingResolution(pricing, usage);

  if (!Object.keys(multipliers).length) {
    return {
      unit_cost: baseCost,
      unit_cost_multiplier: 1,
      resolution,
    };
  }

  if (!resolution) {
    throw new Error(`PROVIDER_PRICING_RESOLUTION_REQUIRED:${pricing.id || "unknown"}`);
  }

  const multiplier = Number(multipliers[resolution]);
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new Error(
      `PROVIDER_PRICING_RESOLUTION_UNPRICED:${pricing.id || "unknown"}:${resolution}`,
    );
  }

  return {
    unit_cost: Number((baseCost * multiplier).toFixed(6)),
    unit_cost_multiplier: multiplier,
    resolution,
  };
}

function tokenUsage(pricing = {}, usage = {}) {
  const actual = usage.actual === true;
  const inputTokens = finite(usage.input_tokens, 0);
  const outputTokens = finite(usage.output_tokens, 0);

  if (!isTokenPriced(pricing)) {
    return {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated: false,
    };
  }

  if (actual) {
    if (inputTokens <= 0 && outputTokens <= 0) {
      throw new Error("PROVIDER_ACTUAL_TOKEN_USAGE_REQUIRED");
    }

    return {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated: false,
    };
  }

  if (inputTokens > 0 || outputTokens > 0) {
    return {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated: usage.estimated !== false,
    };
  }

  const metadata = pricing.metadata || {};
  const estimatedInput = finite(
    metadata.estimated_input_tokens_per_request,
    0,
  );
  const estimatedOutput = finite(
    metadata.estimated_output_tokens_per_request,
    0,
  );

  if (estimatedInput <= 0 && estimatedOutput <= 0) {
    throw new Error(
      `PROVIDER_TOKEN_PRICING_ESTIMATE_REQUIRED:${pricing.id || "unknown"}`,
    );
  }

  return {
    input_tokens: estimatedInput,
    output_tokens: estimatedOutput,
    estimated: true,
  };
}

function calculateSupplierCost({
  pricing,
  usage = {},
}) {
  const resolvedUsage = effectiveUsage(usage);
  const tokens = tokenUsage(pricing, resolvedUsage);
  const configuredDefaultQuantity = finite(
    pricing.metadata?.default_quantity,
    1,
  );
  const quantity = finite(
    resolvedUsage.quantity,
    configuredDefaultQuantity > 0 ? configuredDefaultQuantity : 1,
  );
  const unit = unitCostForUsage(pricing, resolvedUsage);
  let cost = 0;

  if (isTokenPriced(pricing)) {
    cost +=
      (
        tokens.input_tokens *
        finite(pricing.input_cost_per_1m)
      ) /
      1000000;

    cost +=
      (
        tokens.output_tokens *
        finite(pricing.output_cost_per_1m)
      ) /
      1000000;
  }

  if (unit.unit_cost > 0) {
    cost += unit.unit_cost * quantity;
  }

  return {
    supplier_cost: Number(cost.toFixed(6)),
    input_tokens: tokens.input_tokens,
    output_tokens: tokens.output_tokens,
    estimated: tokens.estimated,
    quantity,
    effective_unit_cost: unit.unit_cost,
    unit_cost_multiplier: unit.unit_cost_multiplier,
    pricing_dimensions: unit.resolution
      ? { resolution: unit.resolution }
      : {},
  };
}

function requiredCurrency(pricing = {}, requestedCurrency = null) {
  const configured = String(pricing.currency || "").trim().toUpperCase();
  const requested = String(requestedCurrency || "").trim().toUpperCase();
  const currency = configured || requested;

  if (!currency) {
    throw new Error("PROVIDER_PRICING_CURRENCY_REQUIRED");
  }
  if (configured && requested && configured !== requested) {
    throw new Error(
      `PROVIDER_PRICING_CURRENCY_MISMATCH:${configured}:${requested}`,
    );
  }

  return currency;
}

function zeroPriceAllowed(pricing = {}) {
  const metadata = pricing.metadata || {};
  return (
    metadata.allow_zero_price === true ||
    metadata.zero_price === true ||
    String(metadata.pricing_mode || "").trim().toUpperCase() === "ZERO_PRICE"
  );
}

function resolvedPricing(pricing, {
  provider,
  capability = null,
  model = null,
  currency = null,
  usage = {},
} = {}) {
  if (!pricing) {
    throw new Error(`No pricing configured for ${provider || "provider"}`);
  }

  const pricingCurrency = requiredCurrency(pricing, currency);
  const calculated = calculateSupplierCost({ pricing, usage });
  const customerPrice = calculateMarkup({
    cost: calculated.supplier_cost,
    markup_percent: pricing.markup_percent,
  });
  const zeroPrice = customerPrice === 0;

  if (customerPrice < 0 || (zeroPrice && !zeroPriceAllowed(pricing))) {
    throw new Error(`PROVIDER_PRICING_NON_POSITIVE:${pricing.id}`);
  }

  return {
    provider: pricing.provider || provider,
    capability: pricing.capability || capability,
    model: pricing.model || model || null,
    supplier_cost: calculated.supplier_cost,
    platform_markup: Number(pricing.markup_percent || 0),
    customer_price: customerPrice,
    currency: pricingCurrency,
    unit: pricing.unit || null,
    pricing_id: pricing.id,
    input_tokens: calculated.input_tokens,
    output_tokens: calculated.output_tokens,
    estimated: calculated.estimated,
    zero_price: zeroPrice,
    priced_quantity: calculated.quantity,
    effective_unit_cost: calculated.effective_unit_cost,
    unit_cost_multiplier: calculated.unit_cost_multiplier,
    pricing_dimensions: calculated.pricing_dimensions,
    pricing_metadata: pricing.metadata || {},
  };
}

export const PricingRuntime = {
  resolveRecord({
    pricing,
    provider = null,
    capability = null,
    model = null,
    currency = null,
    usage = {},
  }) {
    if (!pricing || pricing.active !== true) {
      throw new Error(`Active pricing not found: ${pricing?.id || "unknown"}`);
    }

    return resolvedPricing(pricing, {
      provider: pricing.provider || provider,
      capability: pricing.capability || capability,
      model: pricing.model || model,
      currency,
      usage,
    });
  },

  async resolve({
    provider,
    capability = null,
    model = null,
    country = null,
    currency = null,
    usage = {},
  }) {
    const pricing = await getProviderPricing({
      provider,
      capability,
      model,
      country,
      currency,
    });

    return resolvedPricing(pricing, {
      provider,
      capability,
      model,
      currency,
      usage,
    });
  },

  async resolveById({
    pricing_id,
    currency = null,
    usage = {},
  }) {
    const pricing = await getProviderPricingById(pricing_id);
    if (!pricing || pricing.active !== true) {
      throw new Error(`Active pricing not found: ${pricing_id}`);
    }

    return resolvedPricing(pricing, {
      provider: pricing.provider,
      capability: pricing.capability,
      model: pricing.model,
      currency,
      usage,
    });
  },
};
