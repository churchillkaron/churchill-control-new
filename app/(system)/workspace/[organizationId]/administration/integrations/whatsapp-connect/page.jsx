import WhatsAppIntegrationCard from "@/components/administration/integrations/WhatsAppIntegrationCard";

export default async function WhatsAppConnectPage({ params, searchParams }) {
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();

  const resolvedSearch = await searchParams;
  const onboarding = String(resolvedSearch?.onboarding || "") === "1";
  return <WhatsAppIntegrationCard organizationId={organizationId} onboarding={onboarding} />;
}
