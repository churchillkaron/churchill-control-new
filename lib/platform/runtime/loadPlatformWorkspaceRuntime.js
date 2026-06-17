import { getOrganizations } from "@/lib/organizations/getOrganizations";
import { getAvailableModules } from "@/lib/platform/getAvailableModules";
import { getIndustryRuntime } from "@/lib/platform/runtime/getIndustryRuntime";

export async function loadPlatformWorkspaceRuntime() {
  const organizations =
    await getOrganizations({
      platformView: true,
    });

  const platformOrganization =
    organizations.find(
      org =>
        org.organization_type ===
        "enterprise_group"
    );

  const modules =
    await getAvailableModules({
      organizationId:
        platformOrganization?.id,
    });

  const industryIds = [
    "accounting_firm",
    "accounting_client",
    "enterprise",
    "entertainment",
    "construction",
    "pest_control",
    "hotel",
    "restaurant",
  ];

  const industries =
    industryIds
      .map(id => ({
        industry_id: id,
        runtime:
          getIndustryRuntime(id),
      }))
      .filter(
        i => i.runtime
      );

  return {
    success: true,
    organizations,
    modules:
      modules || [],
    industries,
  };
}
