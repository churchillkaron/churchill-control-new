export async function authorize({ context }) {
  const organizationId =
    context?.organizationId ||
    context?.organization_id ||
    null;

  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!context?.actor?.id) {
    throw new Error("Authenticated actor required");
  }

  return true;
}
