import {
  getProviderPricing,
} from "./repositories/ProviderPricingRepository";

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

function calculateSupplierCost({
  pricing,
  usage = {},
}) {
  const inputTokens = Number(usage.input_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);
  const quantity = Number(usage.quantity || 1);
  let cost = 0;

  if (
    pricing.input_cost_per_1m ||
    pricing.output_cost_per_1m
  ) {
    cost +=
      (
        inputTokens *
        Number(pricing.input_cost_per_1m || 0)
      ) /
      1000000;

    cost +=
      (
        outputTokens *
        Number(pricing.output_cost_per_1m || 0)
      ) /
      1000000;
  }

  if (pricing.cost_per_unit) {
    cost += Number(pricing.cost_per_unit) * quantity;
  }

  return Number(cost.toFixed(6));
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

    if (!pricing) {
      throw new Error(`No pricing configured for ${provider}`);
    }

    const pricingCurrency = requiredCurrency(pricing, currency);
    const supplierCost = calculateSupplierCost({
      pricing,
      usage,
    });
    const customerPrice = calculateMarkup({
      cost: supplierCost,
      markup_percent: pricing.markup_percent,
    });

    return {
      provider,
      capability,
      model: pricing.model || model || null,
      supplier_cost: supplierCost,
      platform_markup: Number(pricing.markup_percent || 0),
      customer_price: customerPrice,
      currency: pricingCurrency,
      unit: pricing.unit || null,
      pricing_id: pricing.id,
    };
  },
};
