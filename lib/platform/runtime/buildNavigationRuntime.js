import {
  buildOrganizationNavigation,
} from "@/lib/platform/navigation/buildOrganizationNavigation";

export async function buildNavigationRuntime({
  organization,
  activeTenantId,
  role,
}) {

  const navigation =
    await buildOrganizationNavigation({

      organization,
      activeTenantId,
      userRole: role,

    });

  return {
    success: true,
    navigation,
  };

}
