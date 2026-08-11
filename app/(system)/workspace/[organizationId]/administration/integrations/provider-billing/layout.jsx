import { notFound } from "next/navigation";

import { requirePlatformAdminAccess } from "@/lib/platform/security/requirePlatformAdminAccess";
import { ProviderSupplierAccountRuntime } from "@/lib/platform/service-runtime/billing/runtime/ProviderSupplierAccountRuntime";

export default async function ProviderBillingLayout({ children, params }) {
  const access = await requirePlatformAdminAccess();
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();
  const operatorOrganizationId = access.success
    ? await ProviderSupplierAccountRuntime.resolveOperatorOrganizationId().catch(() => null)
    : null;

  if (
    !access.success ||
    !organizationId ||
    !operatorOrganizationId ||
    organizationId !== operatorOrganizationId
  ) {
    notFound();
  }

  return children;
}
