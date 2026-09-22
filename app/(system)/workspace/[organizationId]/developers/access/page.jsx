import DeveloperPortalShell from "@/components/workspace/developer/DeveloperPortalShell";
import DeveloperAccessManager from "@/components/workspace/developer/DeveloperAccessManager";
import { canManageDeveloperSecurity, requireDeveloperPortalAccess } from "@/lib/developer/DeveloperPortalRuntime";

export const dynamic = "force-dynamic";

export default async function Page({ params }) {
  const resolved = await params;
  const organizationId = String(resolved?.organizationId || "").trim();
  const access = await requireDeveloperPortalAccess({ organizationId });
  if (!access.success || !canManageDeveloperSecurity(access)) return null;
  return <DeveloperPortalShell organizationId={access.organizationId} externalDeveloper={access.externalDeveloper === true} permissions={access.permissions || []} role={access.role || ""} current="/access">
    <DeveloperAccessManager organizationId={access.organizationId} />
  </DeveloperPortalShell>;
}
