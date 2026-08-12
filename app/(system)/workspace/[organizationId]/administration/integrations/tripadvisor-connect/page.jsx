import TripadvisorIntegrationCard from "@/components/administration/integrations/TripadvisorIntegrationCard";

export default async function TripadvisorConnectPage({ params }) {
  const resolved = await params;
  const organizationId = String(resolved?.organizationId || "").trim();
  return <TripadvisorIntegrationCard organizationId={organizationId} />;
}
