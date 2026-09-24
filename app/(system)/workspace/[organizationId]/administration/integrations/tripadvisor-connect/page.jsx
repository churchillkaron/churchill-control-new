import TripadvisorIntegrationCard from "@/components/administration/integrations/TripadvisorIntegrationCard";

export default async function TripadvisorConnectPage({ params, searchParams }) {
  const resolved = await params;
  const organizationId = String(resolved?.organizationId || "").trim();
  const resolvedSearch = await searchParams;
  const onboarding = String(resolvedSearch?.onboarding || "") === "1";
  return <TripadvisorIntegrationCard organizationId={organizationId} onboarding={onboarding} />;
}
