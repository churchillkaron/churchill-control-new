import {
  PaymentProviderRegistry,
} from "../providers/PaymentProviderRegistry";

function clean(value) {
  return String(value ?? "").trim();
}

export function resolvePaymentProvider({
  method,
  country = null,
  preferredProvider = null,
}) {
  const requestedProvider = clean(preferredProvider);

  if (requestedProvider) {
    const provider = PaymentProviderRegistry.getPaymentProvider({
      method,
      providerId: requestedProvider,
      country,
    });

    if (!provider) {
      throw new Error(
        `Configured payment provider ${requestedProvider} is unavailable for ${method}`,
      );
    }

    return provider;
  }

  const providers = PaymentProviderRegistry.getProvidersForMethod({
    method,
    country,
  });

  if (!providers.length) {
    throw new Error(`No payment provider available for ${method}`);
  }

  return providers[0];
}

export const PaymentProviderResolver = {
  resolvePaymentProvider,
};
