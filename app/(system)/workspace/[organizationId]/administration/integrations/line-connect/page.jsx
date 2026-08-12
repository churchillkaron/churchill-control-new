import LINEIntegrationCard from "@/components/administration/integrations/LINEIntegrationCard";

export default async function LINEConnectPage({ params }) {
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();

  return <LINEIntegrationCard organizationId={organizationId} />;
}
