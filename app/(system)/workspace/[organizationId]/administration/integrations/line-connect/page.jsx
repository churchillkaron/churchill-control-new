import LINEIntegrationCard from "@/components/administration/integrations/LINEIntegrationCard";

export default async function LINEConnectPage({ params, searchParams }) {
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();

  const resolvedSearch = await searchParams;
  const onboarding = String(resolvedSearch?.onboarding || "") === "1";
  return <LINEIntegrationCard organizationId={organizationId} onboarding={onboarding} />;
}
