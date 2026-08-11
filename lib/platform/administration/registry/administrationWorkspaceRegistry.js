import PayrollSetupWorkspace from "@/lib/platform/administration/onboarding/workspaces/PayrollSetupWorkspace";

const ONBOARDING_GROUP_ID = "onboarding_setup";
const ADMINISTRATION_ROUTE = "/administration";
const LEGACY_SETTINGS_ROUTE = "/settings";

function canonicalizeAdministrationRoute(route) {
  const value = String(route || "").trim();

  if (value === LEGACY_SETTINGS_ROUTE) {
    return ADMINISTRATION_ROUTE;
  }

  if (value.startsWith(`${LEGACY_SETTINGS_ROUTE}/`)) {
    return `${ADMINISTRATION_ROUTE}${value.slice(LEGACY_SETTINGS_ROUTE.length)}`;
  }

  return value;
}

function canonicalizeAdministrationDomain(registry) {
  const domain = (registry?.domains || []).find(
    (item) => item?.id === "administration"
  );

  if (domain) {
    domain.route = ADMINISTRATION_ROUTE;
  }
}

function canonicalizeAdministrationItems(administration) {
  for (const group of administration?.groups || []) {
    for (const item of group?.items || []) {
      if (item?.route) {
        item.route = canonicalizeAdministrationRoute(item.route);
      }
    }
  }
}

function addPayrollSetup(administration) {
  const groups = administration.groups || [];
  const existingGroup = groups.find((group) => group?.id === ONBOARDING_GROUP_ID);

  if (existingGroup) {
    const items = existingGroup.items || [];

    if (!items.some((item) => item?.id === PayrollSetupWorkspace.id)) {
      existingGroup.items = [...items, PayrollSetupWorkspace].sort(
        (left, right) => Number(left?.order || 0) - Number(right?.order || 0)
      );
    }

    return;
  }

  administration.groups = [
    ...groups,
    {
      id: ONBOARDING_GROUP_ID,
      name: "Onboarding & Setup",
      description:
        "Prepare organization configuration and operational readiness before go-live.",
      order: 1,
      items: [PayrollSetupWorkspace],
    },
  ].sort((left, right) => Number(left?.order || 0) - Number(right?.order || 0));
}

export function applyAdministrationWorkspaceRegistry(registry) {
  const administration = registry?.workspaces?.administration;
  if (!administration) return registry;

  addPayrollSetup(administration);
  canonicalizeAdministrationDomain(registry);
  canonicalizeAdministrationItems(administration);

  return registry;
}

export default applyAdministrationWorkspaceRegistry;
