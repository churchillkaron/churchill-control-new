"use client";

import { useState } from "react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import GoogleAdsIntegrationCard from "@/components/administration/integrations/GoogleAdsIntegrationCard";

export default function GoogleAdsSetupPage() {
  const business = useBusinessContext();
  const organizationId = business?.organization_id || business?.organization?.id || null;
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  if (!business?.ready || !organizationId) {
    return <div className="flex min-h-[460px] items-center justify-center bg-[#F7F6F3] text-[10px] text-[#817B73]">Loading Google Ads setup…</div>;
  }

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-6 text-[#2D2822] lg:p-10">
      <div className="mx-auto max-w-4xl">
        <a href={`/workspace/${encodeURIComponent(organizationId)}/administration/communications-setup?onboarding=1`} className="text-[9px] font-semibold text-[#8A633C]">← Channels & connections</a>
        {error ? <div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{error}</div> : null}
        {notice ? <div className="mt-4 rounded-xl border border-emerald-700/15 bg-emerald-50 px-4 py-3 text-[10px] text-emerald-800">{notice}</div> : null}
        <div className="mt-5">
          <GoogleAdsIntegrationCard organizationId={organizationId} onboarding onNotice={(message) => { setError(""); setNotice(message); }} onError={(message) => { setNotice(""); setError(message); }} />
        </div>
      </div>
    </main>
  );
}
