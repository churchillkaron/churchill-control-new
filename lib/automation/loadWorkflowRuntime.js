export async function loadWorkflowRuntime(
  organizationId,
  { limit = 100 } = {}
) {
  if (!organizationId) {
    return [];
  }

  const params = new URLSearchParams({
    organizationId,
    limit: String(limit),
  });

  const response = await fetch(
    `/api/automation/runtime?${params.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  const result = await response.json();

  if (!response.ok || !result?.success) {
    throw new Error(
      result?.error || "Unable to load workflow runtime"
    );
  }

  return result.logs || [];
}
