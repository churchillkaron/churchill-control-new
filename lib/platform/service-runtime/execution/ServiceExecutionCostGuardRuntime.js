import {
  AsyncLocalStorage,
} from "node:async_hooks";

import {
  ServiceExecutionRuntime,
} from "./ServiceExecutionRuntime";
import {
  PricingRuntime,
} from "../pricing/PricingRuntime";

const EXECUTION_FLAG = Symbol.for(
  "avantiqo.service-execution-cost-guard.v1",
);
const PRICING_FLAG = Symbol.for(
  "avantiqo.service-pricing-cost-guard.v1",
);
const storage = new AsyncLocalStorage();

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedGuard(value = {}) {
  const source = object(value);
  const maximumCustomerPrice = finite(
    source.maximum_customer_price ?? source.maximumCustomerPrice,
  );
  const maximumSupplierCost = finite(
    source.maximum_supplier_cost ?? source.maximumSupplierCost,
  );
  const maximumMarkupPercent = finite(
    source.maximum_markup_percent ?? source.maximumMarkupPercent,
  );
  const estimatedInputTokens = finite(
    source.estimated_input_tokens ?? source.estimatedInputTokens,
  );
  const estimatedOutputTokens = finite(
    source.estimated_output_tokens ?? source.estimatedOutputTokens,
  );
  const estimatedQuantity = finite(
    source.estimated_quantity ?? source.estimatedQuantity,
  );
  const currency = text(source.currency).toUpperCase() || null;
  const reference = text(source.reference || source.budget_reference) || null;

  if (maximumCustomerPrice !== null && maximumCustomerPrice < 0) {
    throw new Error("SERVICE_COST_GUARD_MAXIMUM_CUSTOMER_PRICE_INVALID");
  }
  if (maximumSupplierCost !== null && maximumSupplierCost < 0) {
    throw new Error("SERVICE_COST_GUARD_MAXIMUM_SUPPLIER_COST_INVALID");
  }
  if (maximumMarkupPercent !== null && maximumMarkupPercent < 0) {
    throw new Error("SERVICE_COST_GUARD_MAXIMUM_MARKUP_INVALID");
  }
  if (estimatedInputTokens !== null && estimatedInputTokens < 0) {
    throw new Error("SERVICE_COST_GUARD_ESTIMATED_INPUT_TOKENS_INVALID");
  }
  if (estimatedOutputTokens !== null && estimatedOutputTokens < 0) {
    throw new Error("SERVICE_COST_GUARD_ESTIMATED_OUTPUT_TOKENS_INVALID");
  }
  if (estimatedQuantity !== null && estimatedQuantity <= 0) {
    throw new Error("SERVICE_COST_GUARD_ESTIMATED_QUANTITY_INVALID");
  }

  const enabled =
    maximumCustomerPrice !== null ||
    maximumSupplierCost !== null ||
    maximumMarkupPercent !== null ||
    estimatedInputTokens !== null ||
    estimatedOutputTokens !== null ||
    estimatedQuantity !== null ||
    Boolean(currency);

  return enabled
    ? {
        contract: "SERVICE_EXECUTION_COST_GUARD_V1",
        maximum_customer_price: maximumCustomerPrice,
        maximum_supplier_cost: maximumSupplierCost,
        maximum_markup_percent: maximumMarkupPercent,
        estimated_input_tokens: estimatedInputTokens,
        estimated_output_tokens: estimatedOutputTokens,
        estimated_quantity: estimatedQuantity,
        currency,
        reference,
      }
    : null;
}

function validatePricing(pricing = {}, guard = {}) {
  const customerPrice = finite(pricing.customer_price);
  const supplierCost = finite(pricing.supplier_cost);
  const markupPercent = finite(pricing.platform_markup);
  const currency = text(pricing.currency).toUpperCase();

  if (guard.currency && currency !== guard.currency) {
    throw new Error(
      `SERVICE_COST_GUARD_CURRENCY_MISMATCH:${currency || "MISSING"}:${guard.currency}`,
    );
  }
  if (
    guard.maximum_customer_price !== null &&
    (customerPrice === null || customerPrice > guard.maximum_customer_price)
  ) {
    throw new Error(
      `SERVICE_COST_GUARD_CUSTOMER_PRICE_EXCEEDED:${customerPrice ?? "INVALID"}:${guard.maximum_customer_price}`,
    );
  }
  if (
    guard.maximum_supplier_cost !== null &&
    (supplierCost === null || supplierCost > guard.maximum_supplier_cost)
  ) {
    throw new Error(
      `SERVICE_COST_GUARD_SUPPLIER_COST_EXCEEDED:${supplierCost ?? "INVALID"}:${guard.maximum_supplier_cost}`,
    );
  }
  if (
    guard.maximum_markup_percent !== null &&
    (markupPercent === null || markupPercent > guard.maximum_markup_percent)
  ) {
    throw new Error(
      `SERVICE_COST_GUARD_MARKUP_EXCEEDED:${markupPercent ?? "INVALID"}:${guard.maximum_markup_percent}`,
    );
  }

  return {
    contract: guard.contract,
    reference: guard.reference,
    pricing_id: pricing.pricing_id || null,
    provider: pricing.provider || null,
    model: pricing.model || null,
    capability: pricing.capability || null,
    customer_price: customerPrice,
    supplier_cost: supplierCost,
    platform_markup: markupPercent,
    currency,
    estimated_input_tokens: guard.estimated_input_tokens,
    estimated_output_tokens: guard.estimated_output_tokens,
    estimated_quantity: guard.estimated_quantity,
    pricing_input_tokens: finite(pricing.input_tokens),
    pricing_output_tokens: finite(pricing.output_tokens),
    estimated_pricing: pricing.estimated === true,
    passed: true,
  };
}

function guardedUsage(input = {}, guard = {}) {
  const usage = object(input.usage);
  if (usage.actual === true) return usage;
  return {
    ...usage,
    ...(guard.estimated_input_tokens !== null
      ? { input_tokens: guard.estimated_input_tokens }
      : {}),
    ...(guard.estimated_output_tokens !== null
      ? { output_tokens: guard.estimated_output_tokens }
      : {}),
    ...(guard.estimated_quantity !== null
      ? { quantity: guard.estimated_quantity }
      : {}),
    estimated: true,
  };
}

function installPricingGuard() {
  if (PricingRuntime[PRICING_FLAG]) return;
  const resolveWithoutGuard = PricingRuntime.resolve.bind(PricingRuntime);
  const resolveByIdWithoutGuard = PricingRuntime.resolveById.bind(PricingRuntime);

  Object.defineProperty(PricingRuntime, PRICING_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  PricingRuntime.resolve = async function resolveWithCostGuard(input = {}) {
    const guard = storage.getStore();
    const pricing = await resolveWithoutGuard(
      guard
        ? {
            ...input,
            usage: guardedUsage(input, guard),
          }
        : input,
    );
    if (guard) validatePricing(pricing, guard);
    return pricing;
  };

  PricingRuntime.resolveById = async function resolveByIdWithCostGuard(input = {}) {
    const pricing = await resolveByIdWithoutGuard(input);
    const guard = storage.getStore();
    if (guard) validatePricing(pricing, guard);
    return pricing;
  };
}

function installExecutionGuard() {
  if (ServiceExecutionRuntime[EXECUTION_FLAG]) return;
  const executeWithoutGuard = ServiceExecutionRuntime.execute.bind(
    ServiceExecutionRuntime,
  );

  Object.defineProperty(ServiceExecutionRuntime, EXECUTION_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute = async function executeWithCostGuard(input = {}) {
    const guard = normalizedGuard(input.cost_guard || input.costGuard);
    if (!guard) return executeWithoutGuard(input);

    return storage.run(guard, async () => {
      const result = await executeWithoutGuard({
        ...input,
        metadata: {
          ...object(input.metadata),
          service_cost_guard_contract: guard.contract,
          service_cost_guard_reference: guard.reference,
          service_cost_guard_maximum_customer_price:
            guard.maximum_customer_price,
          service_cost_guard_currency: guard.currency,
          service_cost_guard_estimated_input_tokens:
            guard.estimated_input_tokens,
          service_cost_guard_estimated_output_tokens:
            guard.estimated_output_tokens,
          service_cost_guard_estimated_quantity:
            guard.estimated_quantity,
        },
      });
      const pricing = result?.pricing || result?.reservation_pricing || null;
      const evidence = pricing ? validatePricing(pricing, guard) : null;
      return {
        ...result,
        cost_guard: {
          ...guard,
          evidence,
          passed: true,
        },
      };
    });
  };
}

installPricingGuard();
installExecutionGuard();

export const ServiceExecutionCostGuardRuntime = {
  installed: true,
  normalizedGuard,
  validatePricing,
  guardedUsage,
};
