export async function enqueueJob({
  organization_id,
  type,
  payload
}) {
  return {
    organization_id,
    type,
    payload,
    status: "queued"
  };
}
