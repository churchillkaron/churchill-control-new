export async function validate({ context }) {
  if (!context?.organization_id) {
    throw new Error("organization_id required");
  }
}
