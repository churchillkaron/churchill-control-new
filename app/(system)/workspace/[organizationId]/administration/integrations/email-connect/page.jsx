import EmailIntegrationCard from "@/components/administration/integrations/EmailIntegrationCard";

export default async function EmailConnectPage({ params }) {
  const resolved = await params;
  const organizationId = String(resolved?.organizationId || "").trim();
  return <EmailIntegrationCard organizationId={organizationId} />;
}
