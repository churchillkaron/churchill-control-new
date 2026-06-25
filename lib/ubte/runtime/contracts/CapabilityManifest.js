export function defineCapability(config) {
  const {
    domain,
    capability,
    action,
    version = "1.0.0",
    description = "",
    permissions = [],
    events = [],
    tags = [],
    transactional = true,
    auditable = true,
    aiEnabled = false,
  } = config;

  if (!domain) throw new Error("domain required");
  if (!capability) throw new Error("capability required");
  if (!action) throw new Error("action required");

  return {
    domain,
    capability,
    action,
    version,
    description,
    permissions,
    events,
    tags,
    transactional,
    auditable,
    aiEnabled,
  };
}
