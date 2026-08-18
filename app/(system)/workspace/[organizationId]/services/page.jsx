import { notFound } from "next/navigation";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export default async function ServicesLayout({ children, params }) {
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();
  const access = await requireOrganizationAccess({ organizationId });

  if (!access.success) {
    notFound();
  }

  return children;
}
