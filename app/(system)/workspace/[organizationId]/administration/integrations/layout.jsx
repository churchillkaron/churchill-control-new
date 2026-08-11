import Link from "next/link";

import { requirePlatformAdminAccess } from "@/lib/platform/security/requirePlatformAdminAccess";
import { ProviderSupplierAccountRuntime } from "@/lib/platform/service-runtime/billing/runtime/ProviderSupplierAccountRuntime";

export default async function IntegrationsLayout({ children, params }) {
  const access = await requirePlatformAdminAccess().catch(() => ({ success: false }));
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();
  const operatorOrganizationId = access.success
    ? await ProviderSupplierAccountRuntime.resolveOperatorOrganizationId().catch(() => null)
    : null;
  const isOperatorWorkspace = Boolean(
    access.success &&
      organizationId &&
      operatorOrganizationId &&
      organizationId === operatorOrganizationId,
  );

  const providerBillingRoute = isOperatorWorkspace
    ? `/workspace/${encodeURIComponent(organizationId)}/administration/integrations/provider-billing`
    : "#";

  return (
    <>
      {isOperatorWorkspace ? (
        <div className="mx-auto mb-4 flex max-w-6xl justify-end px-6 pt-6 lg:px-10">
          <Link
            href={providerBillingRoute}
            className="rounded-xl border border-[#D6A66A]/30 bg-[#D6A66A]/10 px-4 py-2 text-sm font-medium text-[#F3D0A5] transition hover:bg-[#D6A66A]/15"
          >
            Provider Billing
          </Link>
        </div>
      ) : null}
      {children}
    </>
  );
}
