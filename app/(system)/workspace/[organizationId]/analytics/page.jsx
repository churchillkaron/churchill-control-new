"use client";

import { useParams } from "next/navigation";

import AnalyticsCommandCenter from "@/components/workspace/analytics/AnalyticsCommandCenter";
import AnalyticsControlPanel from "@/components/workspace/analytics/AnalyticsControlPanel";
import AnalyticsPreferencesPanel from "@/components/workspace/analytics/AnalyticsPreferencesPanel";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

export const dynamic = "force-dynamic";

export default function AnalyticsPage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;

  return (
    <>
      <AnalyticsCommandCenter organizationId={organizationId} />
      <AnalyticsPreferencesPanel organizationId={organizationId} />
      <AnalyticsControlPanel organizationId={organizationId} />
    </>
  );
}
