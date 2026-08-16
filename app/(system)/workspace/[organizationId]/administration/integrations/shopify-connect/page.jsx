import ShopifyIntegrationCard from "@/components/administration/integrations/ShopifyIntegrationCard";
import ShopifyInventorySyncPanel from "@/components/administration/integrations/ShopifyInventorySyncPanel";
import ShopifyFinanceSyncPanel from "@/components/administration/integrations/ShopifyFinanceSyncPanel";

export default async function ShopifyConnectPage({ params }) {
  const resolved = await params;
  const organizationId = String(resolved?.organizationId || "").trim();

  return (
    <div className="min-h-screen bg-black">
      <ShopifyIntegrationCard organizationId={organizationId} />
      <ShopifyInventorySyncPanel organizationId={organizationId} />
      <ShopifyFinanceSyncPanel organizationId={organizationId} />
    </div>
  );
}
