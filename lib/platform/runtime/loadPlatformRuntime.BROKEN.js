import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getOrganizations } from "@/lib/organizations/getOrganizations";

export async function loadPlatformRuntime() {

  const organizations =
    await getOrganizations();

  const organizationInsights =
    buildOrganizationInsights(
      organizations
    );

  const [
    users,
    staff,
    modules,
    invoices,
    organizationModules,
  ] = await Promise.all([

    supabaseAdmin
      .from("organization_users")
      .select("*"),

    supabaseAdmin
      .from("staff_accounts")
      .select("*"),

    supabaseAdmin
      .from("organization_modules")
      .select("*")
      .eq(
        "status",
        "ACTIVE"
      ),

    supabaseAdmin
      .from("invoices")
      .select("*"),

    supabaseAdmin
      .from("organization_modules")
      .select("*")
      .eq(
        "status",
        "ACTIVE"
      ),

  ]);

  const activeOrganizations =
    organizations.filter(
      org =>
        org.status ===
        "active"
    );

  const inactiveOrganizations =
    organizations.filter(
      org =>
        org.status !==
        "active"
    );

  const organizationTree =
    organizations.map(org => ({
      id: org.id,
      name: org.name,
      type: org.organization_type,
      parent: org.parent_organization_id,
    }));

  const moduleUsage = {};

  (modules.data || [])
    .forEach((item) => {

      moduleUsage[
        item.module_id
      ] =
        (
          moduleUsage[
            item.module_id
          ] || 0
        ) + 1;

    });

  const moduleAdoption =
    Object.entries(moduleUsage)
      .sort(
        (a, b) =>
          b[1] - a[1]
      )
      .map(
        ([module, count]) => ({
          module,
          count,
        })
      );

  const organizationMaturity =
    organizations
      .map(org => {

        const modulesCount =
          (organizationModules.data || [])
            .filter(
              item =>
                item.organization_id ===
                org.id
            ).length;

        
return {

  organizations: {
    total: organizations.length,
    active: activeOrganizations.length,
    inactive: inactiveOrganizations.length,
  },

  users: {
    total: users.data?.length || 0,
    staff: staff.data?.length || 0,
  },

  organizationTree,

  moduleAdoption,

  organizationMaturity,

  platformInsights,

  portfolioHealth: {
    organizationsWithModules: completeOrganizations,
    organizationsWithoutModules: noUserOrganizations,
    adoptionRate: organizations.length
      ? (completeOrganizations / organizations.length) * 100
      : 0,
  },

  portfolioOrganizations: organizations.map(org => ({
    id: org.id,
    name: org.name,
    type: org.organization_type,
    parent: org.parent_organization_id,
  })),

  complete: completeOrganizations,
  noUsers: noUserOrganizations,
  notActivated: notActivatedOrganizations,

  rate: organizations.length
    ? (completeOrganizations / organizations.length) * 100
    : 0,

  actionQueue,

};
