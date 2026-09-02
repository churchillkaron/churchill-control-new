"use client";

import { useParams } from "next/navigation";

import AnalyticsCommandCenter from "@/components/workspace/analytics/AnalyticsCommandCenter";
import AnalyticsControlPanel from "@/components/workspace/analytics/AnalyticsControlPanel";
import AnalyticsPreferencesPanel from "@/components/workspace/analytics/AnalyticsPreferencesPanel";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const MODE_LABELS = {
  dashboards: "Dashboards",
  dashboard: "Dashboards",
  reports: "Reports",
  report: "Reports",
  kpis: "KPIs",
  metrics: "KPIs & Metrics",
  forecasts: "Forecasts",
  forecast: "Forecasts",
  alerts: "Alerts",
  lineage: "Lineage",
};

function titleCase(value) {
  return String(value || "Analytics")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function AnalyticsNestedPage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId =
    params?.organizationId ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;
  const segments = Array.isArray(params?.analyticsRoute)
    ? params.analyticsRoute
    : params?.analyticsRoute
      ? [params.analyticsRoute]
      : [];
  const mode = String(segments[0] || "overview").toLowerCase();
  const label = MODE_LABELS[mode] || titleCase(mode);

  return (
    <>
      <div className="mx-auto mb-3 max-w-[1750px] rounded-xl border border-black/[0.07] bg-white px-4 py-2.5 text-[11px] text-[#716C64]">
        <span className="font-medium text-[#3F3B35]">Analytics · {label}</span>
        <span className="ml-2">This workspace uses the same governed semantic metrics, source lineage and control state as the Analytics command center.</span>
      </div>
      <AnalyticsCommandCenter organizationId={organizationId} />
      <AnalyticsPreferencesPanel organizationId={organizationId} />
      <AnalyticsControlPanel organizationId={organizationId} />
    </>
  );
}
