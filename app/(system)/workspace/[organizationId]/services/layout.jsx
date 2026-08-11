import { notFound } from "next/navigation";

import { requirePlatformOperatorWorkspaceAccess } from "@/lib/platform/security/requirePlatformOperatorWorkspaceAccess";

export default async function ServicesLayout({ children, params }) {
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();
  const access = await requirePlatformOperatorWorkspaceAccess({ organizationId });

  if (!access.success) {
    notFound();
  }

  return children;
}
