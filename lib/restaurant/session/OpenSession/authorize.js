export async function authorize({
  organizationId,
  actor,
}) {
  if (!organizationId) {
    throw new Error(
      "organizationId required"
    );
  }

  return true;
}
