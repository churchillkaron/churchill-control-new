import {
  getProviderPricing,
  getProviderPricingById,
} from "./repositories/ProviderPricingRepository";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function calculateMarkup({ cost, markup_percent = 0 }) {
  return Number((Number(cost) * (1 + Number(markup_percent) / 100)).toFixed(6));
}

function isTokenPriced(pricing = {}) {
  return finite(pricing.input_cost_per_1m) > 0 || finite(pricing.output_cost_per_1m) > 0;
}

function tokenUsage(pricing = {}, usage = {}) {
  const actual = usage.actual === true;
  const inputTokens = finite(usage.input_tokens, 0);
  const outputTokens = finite(usage.output_tokens, 0);

  if (!isTokenPriced(pricing)) {
    return { input_tokens: inputTokens, output_tokens: outputTokens, estimated: false };
  }

  if (actual) {
    if (inputTokens <= 0 && outputTokens <= 0) {
      throw new Error("PROVIDER_ACTUAL_TOKEN_USAGE_REQUIRED");
    }
    return { input_tokens: inputTokens, output_tokens: outputTokens, estimated: false };
  }

  if (inputTokens > 0 || outputTokens > 0) {
    return {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated: usage.estimated !== false,
    };
  }

  const metadata = pricing.metadata || {};
  const estimatedInput = finite(metadata.estimated_input_tokens_per_request, 0);
  const estimatedOutput = finite(metadata.estimated_output_tokens_per_request, 0);

  if (estimatedInput <= 0 && estimatedOutput <= 0) {
    throw new Error(`PROVIDER_TOKEN_PRICING_ESTIMATE_REQUIRED:${pricing.id || "unknown"}`);
  }

  return {
    input_tokens: estimatedInput,
    output_tokens: estimatedOutput,
    estimated: true,
  };
}

function dimension(value) {
  return String(value ?? "").trim().toLowerCase();
}

function resolveUnitPrice(pricing = {}, usage = {}) {
  const metadata = pricing.metadata || {};
  const mode = String(metadata.pricing_mode || "").trim().toUpperCase();
  const base = finite(pricing.cost_per_unit, 0);

  if (mode !== "DIMENSIONAL_UNIT_MATRIX") {
    return { cost_per_unit: base, dimension_key: null };
  }

  const matrix = metadata.unit_price_matrix;
  if (!matrix || typeof matrix !== "object" || Array.isArray(matrix)) {
    throw new Error(`PROVIDER_DIMENSIONAL_PRICE_MATRIX_REQUIRED:${pricing.id}`);
  }

  const requestedQuality = dimension(usage.quality);
  const requestedSize = dimension(usage.size);
  const defaultQuality = dimension(metadata.default_quality);
  const defaultSize = dimension(metadata.default_size);
  const quality = !requestedQuality || requestedQuality === "auto" ? defaultQuality : requestedQuality;
  const size = !requestedSize || requestedSize === "auto" ? defaultSize : requestedSize;

  if (!quality || !size) {
    throw new Error(`PROVIDER_DIMENSIONAL_PRICE_DIMENSIONS_REQUIRED:${pricing.id}`);
  }

  const key = `${quality}:${size}`;
  const selected = Number(matrix[key]);
  if (!Number.isFinite(selected) || selected <= 0) {
    throw new Error(`PROVIDER_DIMENSIONAL_PRICE_REQUIRED:${pricing.id}:${key}`);
  }

  return { cost_per_unit: selected, dimension_key: key };
}

function calculateSupplierCost({ pricing, usage = {} }) {
  const tokens = tokenUsage(pricing, usage);
  const configuredDefaultQuantity = finite(pricing.metadata?.default_quantity, 1);
  const quantity = finite(
    usage.quantity,
    configuredDefaultQuantity > 0 ? configuredDefaultQuantity : 1,
  );
  const unitPrice = resolveUnitPrice(pricing, usage);
  let cost = 0;

  if (isTokenPriced(pricing)) {
    cost += (tokens.input_tokens * finite(pricing.input_cost_per_1m)) / 1000000;
    cost += (tokens.output_tokens * finite(pricing.output_cost_per_1m)) / 1000000;
  }
  if (unitPrice.cost_per_unit > 0) cost += unitPrice.cost_per_unit * quantity;

  return {
    supplier_cost: Number(cost.toFixed(6)),
    input_tokens: tokens.input_tokens,
    output_tokens: tokens.output_tokens,
    estimated: tokens.estimated,
    unit_cost: unitPrice.cost_per_unit,
    pricing_dimension_key: unitPrice.dimension_key,
    quantity,
  };
}

function requiredCurrency(pricing = {}, requestedCurrency = null) {
  const configured = String(pricing.currency || "").trim().toUpperCase();
  const requested = String(requestedCurrency || "").trim().toUpperCase();
  const currency = configured || requested;
  if (!currency) throw new Error("PROVIDER_PRICING_CURRENCY_REQUIRED");
  if (configured && requested && configured !== requested) {
    throw new Error(`PROVIDER_PRICING_CURRENCY_MISMATCH:${configured}:${requested}`);
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

function benchmarkInactivePricingAllowed(pricing = {}) {
  return (
    pricing?.active === false &&
    pricing?.benchmark_review_preview_authorized === true &&
    pricing?.metadata?.owned_inference === true &&
    pricing?.metadata?.runtime_compatible === true &&
    pricing?.metadata?.model_license_verified === true &&
    String(pricing?.metadata?.pricing_status || "").trim().toUpperCase() === "MARKET_PARITY_READY" &&
    pricing?.metadata?.production_routing_allowed === false
  );
}

function resolvedPricing(pricing, {
  provider,
  capability = null,
  model = null,
  currency = null,
  usage = {},
} = {}) {
  if (!pricing) throw new Error(`No pricing configured for ${provider || "provider"}`);

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
    unit_cost: calculated.unit_cost,
    quantity: calculated.quantity,
    pricing_dimension_key: calculated.pricing_dimension_key,
    pricing_id: pricing.id,
    input_tokens: calculated.input_tokens,
    output_tokens: calculated.output_tokens,
    estimated: calculated.estimated,
    zero_price: zeroPrice,
    benchmark_review_preview: benchmarkInactivePricingAllowed(pricing),
    production_pricing_active: pricing.active === true,
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
    if (!pricing || (pricing.active !== true && !benchmarkInactivePricingAllowed(pricing))) {
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

    return resolvedPricing(pricing, { provider, capability, model, currency, usage });
  },

  async resolveById({ pricing_id, currency = null, usage = {} }) {
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
