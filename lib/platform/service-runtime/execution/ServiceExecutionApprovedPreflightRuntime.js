import {
  ServiceExecutionRuntime,
} from "./ServiceExecutionRuntime";
import {
  ServiceExecutionPreflightRuntime,
} from "./ServiceExecutionPreflightRuntime";
import {
  withPricingExecutionContext,
} from "../pricing/PricingExecutionContextRuntime";

const FLAG = Symbol.for(
  "avantiqo.service-execution-approved-preflight.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function approvedExecutionPreflight(input = {}) {
  return object(
    input.approved_execution_preflight ||
    input.metadata?.approved_execution_preflight,
  );
}

if (!ServiceExecutionRuntime[FLAG]) {
  const executeWithoutApprovedPreflight = ServiceExecutionRuntime.execute.bind(
    ServiceExecutionRuntime,
  );

  Object.defineProperty(ServiceExecutionRuntime, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute = async function executeWithApprovedPreflight(
    input = {},
  ) {
    const approved = approvedExecutionPreflight(input);
    if (!Object.keys(approved).length) {
      return executeWithoutApprovedPreflight(input);
    }

    if (text(approved.contract) !== ServiceExecutionPreflightRuntime.contract) {
      throw new Error("SERVICE_EXECUTION_APPROVED_PREFLIGHT_CONTRACT_INVALID");
    }

    const preflight = await ServiceExecutionPreflightRuntime.resolve({
      ...input,
      provider_id: approved.provider || input.provider_id || null,
      currency: approved.currency || input.currency || null,
      input: {
        ...object(input.input),
        quantity: approved.quantity,
        currency:
          approved.currency ||
          object(input.input).currency ||
          input.currency ||
          null,
        pricing_dimensions: object(approved.pricing_dimensions),
      },
      pricing_usage: {
        ...object(input.pricing_usage),
        quantity: approved.quantity,
        pricing_dimensions: object(approved.pricing_dimensions),
      },
      approved_execution_preflight: approved,
    });

    return withPricingExecutionContext(
      {
        pricing_usage: {
          quantity: preflight.quantity,
          pricing_dimensions: object(preflight.pricing_dimensions),
        },
      },
      () => executeWithoutApprovedPreflight({
        ...input,
        provider_id: preflight.provider,
        currency: preflight.currency,
        quantity: preflight.quantity,
        input: {
          ...object(input.input),
          quantity: preflight.quantity,
          currency: preflight.currency,
          pricing_dimensions: object(preflight.pricing_dimensions),
        },
        metadata: {
          ...object(input.metadata),
          approved_execution_preflight: approved,
          service_execution_preflight_contract: preflight.contract,
          service_execution_preflight_pricing_id: preflight.pricing_id,
          service_execution_preflight_customer_price:
            preflight.customer_price,
          service_execution_preflight_quantity: preflight.quantity,
          service_execution_preflight_unit: preflight.unit,
        },
      }),
    );
  };
}

export const ServiceExecutionApprovedPreflightRuntime = Object.freeze({
  installed: true,
  contract: "SERVICE_EXECUTION_APPROVED_PREFLIGHT_GUARD_V1",
});
