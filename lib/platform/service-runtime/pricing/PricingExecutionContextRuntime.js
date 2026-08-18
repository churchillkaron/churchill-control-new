import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage();

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function getPricingExecutionContext() {
  return object(storage.getStore());
}

export function withPricingExecutionContext(context = {}, callback) {
  if (typeof callback !== "function") {
    throw new Error("PRICING_EXECUTION_CONTEXT_CALLBACK_REQUIRED");
  }
  const current = getPricingExecutionContext();
  return storage.run(
    {
      ...current,
      ...object(context),
      pricing_usage: {
        ...object(current.pricing_usage),
        ...object(context.pricing_usage),
      },
    },
    callback,
  );
}

export const PricingExecutionContextRuntime = Object.freeze({
  get: getPricingExecutionContext,
  run: withPricingExecutionContext,
});
