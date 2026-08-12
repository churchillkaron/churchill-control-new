import WhatsAppIntegrationCard from "@/components/administration/integrations/WhatsAppIntegrationCard";

export default async function WhatsAppConnectPage({ params }) {
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();

  return <WhatsAppIntegrationCard organizationId={organizationId} />;
}
