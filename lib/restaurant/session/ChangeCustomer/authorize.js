export async function authorize({ context }) {
  if (!context?.organization_id) {
    throw new Error("organization_id required");
  }
}
