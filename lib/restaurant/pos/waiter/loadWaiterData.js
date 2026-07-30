import defaultPOSSettings from "@/lib/settings/defaultPOSSettings";

export async function loadWaiterData(organizationId) {
  if (!organizationId || typeof organizationId !== "string") {
    return {
      zones: [],
      tables: [],
      dishes: [],
      posSettings: defaultPOSSettings || {},
      financialPolicy: null,
      organization: null,
      access: null,
    };
  }

  const response = await fetch(
    `/api/pos/runtime?organizationId=${encodeURIComponent(organizationId)}`,
    {
      method: "GET",
      cache: "no-store",
      credentials: "include",
    }
  );

  const result = await response.json();

  if (!response.ok || result.success === false) {
    throw new Error(result.error || "Unable to load POS runtime");
  }

  return {
    zones: result.zones || [],
    tables: [...(result.tables || [])].sort(
      (a, b) =>
        Number(
          String(a.table_name || a.table_number || "").replace(/\D/g, "")
        ) -
        Number(
          String(b.table_name || b.table_number || "").replace(/\D/g, "")
        )
    ),
    dishes: result.dishes || [],
    posSettings: {
      ...(defaultPOSSettings || {}),
      ...(result.posSettings || {}),
    },
    financialPolicy: result.financialPolicy || null,
    organization: result.organization || null,
    access: result.access || null,
  };
}
