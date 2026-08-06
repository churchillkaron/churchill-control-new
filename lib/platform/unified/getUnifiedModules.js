import { SYSTEM_REGISTRY } from "@/lib/shared/architecture/systemRegistry";
import { DOMAIN_REGISTRY } from "@/lib/platform/domains/domainRegistry";
import { getAvailableModules } from "@/lib/platform/getAvailableModules";

/**
 * Unified organization runtime projection.
 *
 * Installed platform modules are resolved through the canonical
 * organization_modules -> platform_modules loader.
 */
export async function getUnifiedModules({
  organizationId,
}) {
  const installedModules =
    await getAvailableModules({
      organizationId,
    });

  return {
    system: SYSTEM_REGISTRY,
    domainModules:
      Object.values(DOMAIN_REGISTRY),
    platformModules:
      installedModules,
    installedModules,
  };
}
