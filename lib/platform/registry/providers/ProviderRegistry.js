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
