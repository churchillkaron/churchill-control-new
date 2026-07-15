export default async function createEdgeTask({
  type,
  payload = {},
}) {

  return {
    success: true,
    edge: true,
    type,
    payload,
    created_at:
      new Date().toISOString(),
  };
}
