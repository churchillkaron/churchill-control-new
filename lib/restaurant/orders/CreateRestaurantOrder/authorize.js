export async function authorize({
  context,
}) {
  if (!context?.organizationId) {
    throw new Error("organizationId required");
  }

  return true;
}
