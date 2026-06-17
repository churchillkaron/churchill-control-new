export async function getCreativeAssetsClient({
  tenantId,
  organizationId = null,
}) {
  const params =
    new URLSearchParams();

  if (tenantId) {
    params.set("tenantId", tenantId);
  }

  if (organizationId) {
    params.set("organizationId", organizationId);
  }

  const response =
    await fetch(`/api/design/assets?${params.toString()}`);

  const data =
    await response.json();

  if (!response.ok || !data.success) {
    throw new Error(
      data.error || "Failed to load creative assets"
    );
  }

  return data.assets || [];
}
