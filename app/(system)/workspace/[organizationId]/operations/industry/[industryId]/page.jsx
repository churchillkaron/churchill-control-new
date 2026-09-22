"use client";

export const dynamic = "force-dynamic";

import { redirect, useParams } from "next/navigation";

import OperationsIndustryCommandCenter from "@/components/workspace/operations/OperationsIndustryCommandCenter";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";
import { getOperationsIndustryProfile } from "@/lib/operations/presentation/OperationsIndustryProfiles";

const SPECIALIZED_INDUSTRY_ROUTES = Object.freeze({
  restaurant: "/operations/restaurant",
  bar: "/operations/restaurant",
  pub: "/operations/restaurant",
  cafe: "/operations/restaurant",
  "coffee-shop": "/operations/restaurant",
  "food-service": "/operations/restaurant",
  "food-and-beverage": "/operations/restaurant",
  "f-and-b": "/operations/restaurant",
  hotel: "/operations/hotel",
  resort: "/operations/hotel",
  accommodation: "/operations/hotel",
  lodging: "/operations/hotel",
  "guest-house": "/operations/hotel",
  guesthouse: "/operations/hotel",
  "pest-control": "/operations/field-service",
  pestcontrol: "/operations/field-service",
  "pest-management": "/operations/field-service",
});

export default function AdaptiveIndustryOperationsPage() {
  const params = useParams();
  const { organization, loading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";
  const industryId = String(params?.industryId || "").trim();
  const specializedRoute = SPECIALIZED_INDUSTRY_ROUTES[industryId.toLowerCase()];
  if (specializedRoute && organizationId) {
    redirect(`/workspace/${encodeURIComponent(String(organizationId))}${specializedRoute}`);
  }

  const profile = getOperationsIndustryProfile(industryId) || getOperationsIndustryProfile("general-operations");

  if (loading) {
    return <div className="min-h-[420px] bg-[#F7F6F3] p-8 text-sm text-[#77736C]">Preparing {profile.title}...</div>;
  }

  return (
    <OperationsIndustryCommandCenter
      profile={profile}
      organizationId={organizationId}
      organizationName={organization?.name}
    />
  );
}
