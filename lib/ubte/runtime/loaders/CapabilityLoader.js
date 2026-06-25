import { getDomainRuntime } from "../domains/DomainRuntimeRegistry";

export async function loadCapability({
  domain,
  capability,
  action,
}) {
  const domainRuntime =
    getDomainRuntime(domain);

  const capabilityGroup =
    domainRuntime.capabilities?.[capability];

  if (!capabilityGroup) {
    throw new Error(
      `Capability not registered: ${domain}.${capability}`
    );
  }

  const loader =
    capabilityGroup[action];

  if (!loader) {
    throw new Error(
      `Action not registered: ${domain}.${capability}.${action}`
    );
  }

  const module =
    await loader();

  if (
    !module ||
    typeof module.execute !== "function"
  ) {
    throw new Error(
      `Capability missing execute(): ${domain}.${capability}.${action}`
    );
  }

  return {
    domainRuntime,
    module,
    execute:
      module.execute,
    manifest:
      module.manifest || null,
  };
}
