import { providerRuntime } from "../../providers";

export function buildProviderRegistry() {
  return providerRuntime
    .list()
    .sort((a, b) =>
      a.name.localeCompare(b.name)
    );
}

export function getProvider(id) {
  return providerRuntime.get(id);
}

export function providerSupportsCapabilities(provider, requiredCapabilities = []) {
  const capabilities = provider?.capabilities || [];

  return requiredCapabilities.every((capability) =>
    capabilities.includes(capability)
  );
}

export function getProvidersForService(service) {
  const requiredCapabilities = service?.requires || [];

  return buildProviderRegistry()
    .filter((provider) =>
      providerSupportsCapabilities(provider, requiredCapabilities)
    );
}
