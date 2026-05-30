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
      .from("tenant_modules")
      .select("*"),

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

          id: org.id,
          name: org.name,
          type: org.organization_type,
          modules: modulesCount,

        };

      })
      .sort(
        (a, b) =>
          b.modules - a.modules
      );

  const platformAverageModules =
    organizationMaturity.length
      ? (
          organizationMaturity.reduce(
            (sum, org) =>
              sum + org.modules,
            0
          ) /
          organizationMaturity.length
        )
      : 0;

  const expansionOpportunities =
    organizationMaturity.filter(
      org =>
        org.modules <
        platformAverageModules
    );

  const organizationsWithModules =
    organizationMaturity.filter(
      org => org.modules > 0
    ).length;

  const organizationsWithoutModules =
    organizationMaturity.filter(
      org => org.modules === 0
    ).length;

  const adoptionRate =
    organizations.length
      ? (
          organizationsWithModules /
          organizations.length
        ) * 100
      : 0;

  const onboardingOrganizations =
    organizationMaturity.map(org => {

      const usersCount =
        (users.data || [])
          .filter(
            user =>
              user.organization_id === org.id &&
              user.status === "active"
          )
          .length;

      return {

        ...org,

        users:
          usersCount,

      };

    });

  const completeOrganizations =
    onboardingOrganizations.filter(
      org =>
        org.modules > 0 &&
        org.users > 0
    ).length;

  const noUserOrganizations =
    onboardingOrganizations.filter(
      org =>
        org.modules > 0 &&
        org.users === 0
    ).length;

  const notActivatedOrganizations =
    onboardingOrganizations.filter(
      org =>
        org.modules === 0
    ).length;

  const actionQueue = {

    needsUsers:
      onboardingOrganizations.filter(
        org =>
          org.modules > 0 &&
          org.users === 0
      ),

    needsActivation:
      onboardingOrganizations.filter(
        org =>
          org.modules === 0
      ),

  };

  const onboardingRate =
    organizations.length
      ? (
          completeOrganizations /
          organizations.length
        ) * 100
      : 0;

  const platformInsights = [];

  if (
    expansionOpportunities.length
  ) {

    platformInsights.push({

      severity: "warning",

      title:
        "Expansion Opportunity",

      message:
        `${expansionOpportunities.length} organizations are below platform maturity.`,

    });

  }

  const zeroModuleOrganizations =
    organizationMaturity.filter(
      org =>
        org.modules === 0
    );

  if (
    zeroModuleOrganizations.length
  ) {

    platformInsights.push({

      severity: "critical",

      title:
        "No Modules Deployed",

      message:
        `${zeroModuleOrganizations.length} organizations have zero active modules.`,

    });

  }

  if (
    organizationMaturity[0]
  ) {

    platformInsights.push({

      severity: "success",

      title:
        "Top Performing Organization",

      message:
        `${organizationMaturity[0].name} has ${organizationMaturity[0].modules} active modules.`,

    });

  }

  return {

    organizations: {

      total:
        organizations.length,

      active:
        activeOrganizations.length,

      inactive:
        inactiveOrganizations.length,

    },

    users: {

      total:
        users.data?.length || 0,

      staff:
        staff.data?.length || 0,

    },

    modules: {

      total:
        modules.data?.length || 0,

      usage:
        moduleUsage,

    },

    invoices: {

      total:
        invoices.data?.length || 0,

      outstanding:
        (invoices.data || [])
          .filter(
            invoice =>
              invoice.status !==
              "PAID"
          ).length,

    },

    portfolio: {

      activeOrganizations:
        activeOrganizations.length,

      inactiveOrganizations:
        inactiveOrganizations.length,

      moduleUsage:
        Object.entries(moduleUsage)
          .sort(
            (a, b) =>
              b[1] - a[1]
          )
          .slice(0, 5),

    },

    organizationInsights,

    organizationTree,

    moduleAdoption,

    organizationMaturity,

    platformAverageModules,

    expansionOpportunities,

    platformInsights,

    portfolioHealth: {

      organizationsWithModules,

      organizationsWithoutModules,

      adoptionRate,

    },

    onboarding: {

      complete:
        completeOrganizations,

      noUsers:
        noUserOrganizations,

      notActivated:
        notActivatedOrganizations,

      rate:
        onboardingRate,

    },

    actionQueue,

    onboardingOrganizations,

    portfolioOrganizations:
      organizations.map(org => ({

        id:
          org.id,

        name:
          org.name,

        type:
          org.organization_type,

        status:
          org.status,

      })),

  };

}

export function buildOrganizationInsights(
  organizations = []
) {

  return {

    enterpriseGroups:
      organizations.filter(
        o =>
          o.organization_type ===
          "enterprise_group"
      ).length,

    accountingFirms:
      organizations.filter(
        o =>
          o.organization_type ===
          "accounting_firm"
      ).length,

    directBusinesses:
      organizations.filter(
        o =>
          o.organization_type ===
          "direct_business"
      ).length,

    clientCompanies:
      organizations.filter(
        o =>
          o.organization_type ===
          "client_company"
      ).length,

  };

}
