import ShopifyIntegrationCard from "@/components/administration/integrations/ShopifyIntegrationCard";

export default async function ShopifyConnectPage({ params }) {
  const resolved = await params;
  const organizationId = String(resolved?.organizationId || "").trim();
  return <ShopifyIntegrationCard organizationId={organizationId} />;
}
