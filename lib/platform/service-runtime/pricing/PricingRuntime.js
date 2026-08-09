import {
  getProviderPricing,
  getProviderPricingById,
} from "./repositories/ProviderPricingRepository";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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
  const tokens = tokenUsage(pricing, usage);
  const configuredDefaultQuantity = finite(
    pricing.metadata?.default_quantity,
    1,
  );
  const quantity = finite(
    usage.quantity,
    configuredDefaultQuantity > 0 ? configuredDefaultQuantity : 1,
  );
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

  if (finite(pricing.cost_per_unit) > 0) {
    cost += finite(pricing.cost_per_unit) * quantity;
  }

  return {
    supplier_cost: Number(cost.toFixed(6)),
    input_tokens: tokens.input_tokens,
    output_tokens: tokens.output_tokens,
    estimated: tokens.estimated,
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
    pricing_metadata: pricing.metadata || {},
  };
}

export const PricingRuntime = {
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
