"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import CampaignCommandCenter from "@/components/marketing/CampaignCommandCenter";

export default function CampaignsLayout({ children }) {
  const params = useParams();
  const pathname = usePathname();
  const organizationId = String(params?.organizationId || "");
  const base = `/workspace/${organizationId}/commercial/marketing/campaigns`;
  const wholeActive = pathname === `${base}/whole`;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-40 border-b border-white/10 bg-black/90 px-6 py-3 backdrop-blur-xl lg:px-10">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-2">
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
          <CampaignCommandCenter />
        </div>
      </div>
      {children}
    </div>
  );
}
