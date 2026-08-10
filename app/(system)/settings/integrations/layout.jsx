import Link from "next/link";

import { requirePlatformAdminAccess } from "@/lib/platform/security/requirePlatformAdminAccess";

export default async function IntegrationsLayout({ children }) {
  const access = await requirePlatformAdminAccess().catch(() => ({ success: false }));

  return (
    <>
      {access.success ? (
        <div className="mx-auto mb-4 flex max-w-6xl justify-end px-6 pt-6 lg:px-10">
          <Link
            href="/settings/integrations/provider-billing"
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
