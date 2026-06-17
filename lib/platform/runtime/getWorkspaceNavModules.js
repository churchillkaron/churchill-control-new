import { getAvailableModules } from "@/lib/platform/getAvailableModules";

/**
 * SINGLE SOURCE OF TRUTH FOR WORKSPACE NAV MODULES
 */
export async function getWorkspaceNavModules({
  organizationId,
  industry,
}) {
  const modules = await getAvailableModules({
    organizationId,
    industry,
  });

  return (modules || []).map((m) => ({
    id: m.key,
    name: m.name,
    category: m.category || "platform",
  }));
}
