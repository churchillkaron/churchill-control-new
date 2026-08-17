"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import CampaignCommandCenter from "@/components/marketing/CampaignCommandCenter";

export default function CampaignsLayout({ children }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const organizationId = String(params?.organizationId || "");
  const base = `/workspace/${organizationId}/commercial/marketing/campaigns`;
  const wholeActive = pathname === `${base}/whole`;
  const [capabilities, setCapabilities] = useState(null);

  useEffect(() => {
    if (!organizationId) return;
    let active = true;

    async function loadCapabilities() {
      try {
        const response = await fetch("/api/marketing/campaign-command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "context",
            ownerOrganizationId: organizationId,
          }),
        });
        const payload = await response.json();
        if (!active) return;
        if (!response.ok || payload?.success === false) {
          setCapabilities({
            canCreateCampaign: false,
            canUseWholeCampaign: false,
            accessibleOrganizationCount: 0,
          });
          return;
        }
        setCapabilities(payload?.data?.capabilities || null);
      } catch {
        if (active) {
          setCapabilities({
            canCreateCampaign: false,
            canUseWholeCampaign: false,
            accessibleOrganizationCount: 0,
          });
        }
      }
    }

    loadCapabilities();
    return () => {
      active = false;
    };
  }, [organizationId]);

  useEffect(() => {
    if (!capabilities || !wholeActive) return;
    if (!capabilities.canUseWholeCampaign) {
      router.replace(base);
    }
  }, [base, capabilities, router, wholeActive]);

  const canUseWholeCampaign = capabilities?.canUseWholeCampaign === true;
  const canCreateCampaign = capabilities?.canCreateCampaign === true;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-40 border-b border-white/10 bg-black/95 px-6 py-3 lg:px-10">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-2">
          {canUseWholeCampaign ? (
            <>
              <Link
                href={`${base}/whole`}
                className={`rounded-full px-5 py-2 text-sm transition ${
                  wholeActive
                    ? "bg-[#D6A66A] font-semibold text-black"
                    : "border border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08]"
                }`}
              >
                Whole Campaign
              </Link>
              <Link
                href={base}
                className={`rounded-full px-5 py-2 text-sm transition ${
                  !wholeActive
                    ? "bg-[#D6A66A] font-semibold text-black"
                    : "border border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08]"
                }`}
              >
                By Organization
              </Link>
            </>
          ) : (
            <Link
              href={base}
              className="rounded-full bg-[#D6A66A] px-5 py-2 text-sm font-semibold text-black"
            >
              Campaigns
            </Link>
          )}

          {canCreateCampaign ? (
            <div
              className={
                canUseWholeCampaign
                  ? "ml-auto"
                  : "ml-auto [&>div>button:nth-child(2)]:hidden"
              }
            >
              <CampaignCommandCenter />
            </div>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}
