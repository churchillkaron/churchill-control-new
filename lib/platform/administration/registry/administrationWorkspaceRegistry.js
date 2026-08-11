import PayrollSetupWorkspace from "@/lib/platform/administration/onboarding/workspaces/PayrollSetupWorkspace";

const ONBOARDING_GROUP_ID = "onboarding_setup";

export function applyAdministrationWorkspaceRegistry(registry) {
  const administration = registry?.workspaces?.administration;
  if (!administration) return registry;

  const groups = administration.groups || [];
  const existingGroup = groups.find((group) => group?.id === ONBOARDING_GROUP_ID);

  if (existingGroup) {
    const items = existingGroup.items || [];
    if (!items.some((item) => item?.id === PayrollSetupWorkspace.id)) {
      existingGroup.items = [...items, PayrollSetupWorkspace].sort(
        (left, right) => Number(left?.order || 0) - Number(right?.order || 0)
      );
    }
    return registry;
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

  return registry;
}

export default applyAdministrationWorkspaceRegistry;
