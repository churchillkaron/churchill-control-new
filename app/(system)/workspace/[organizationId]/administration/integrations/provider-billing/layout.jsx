import { notFound } from "next/navigation";

import { requirePlatformAdminAccess } from "@/lib/platform/security/requirePlatformAdminAccess";

export default async function ProviderBillingLayout({ children }) {
  const access = await requirePlatformAdminAccess();

  if (!access.success) {
    notFound();
  }

  return children;
}
