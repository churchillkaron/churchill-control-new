import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getOrganizations } from "@/lib/organizations/getOrganizations";

export async function loadPlatformRuntime() {
  const organizations = await getOrganizations();

  const activeOrganizations = organizations.filter(
    o => o.status === "active"
  );

  const inactiveOrganizations = organizations.filter(
    o => o.status !== "active"
  );

  const organizationTree = organizations.map(org => ({
    id: org.id,
    name: org.name,
    type: org.organization_type,
    parent: org.parent_organization_id,
  }));

  return {
    organizations: {
      total: organizations.length,
      active: activeOrganizations.length,
      inactive: inactiveOrganizations.length,
    },

    organizationTree,

    moduleAdoption: [],
    organizationMaturity: [],

    organizationInsights: [],

    platformInsights: [],

    portfolioHealth: {
      organizationsWithModules: 0,
      organizationsWithoutModules: 0,
      adoptionRate: 0,
    },

    portfolioOrganizations: organizationTree,

    complete: activeOrganizations.length,
    noUsers: 0,
    notActivated: inactiveOrganizations.length,

    rate: organizations.length
      ? (activeOrganizations.length / organizations.length) * 100
      : 0,

    actionQueue: {},
  };
}
