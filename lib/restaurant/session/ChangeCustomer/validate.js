export async function validate({ context, payload }) {
  const organizationId =
    context?.organizationId ||
    context?.organization_id ||
    null;

  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("payload required");
  }

  return true;
}
