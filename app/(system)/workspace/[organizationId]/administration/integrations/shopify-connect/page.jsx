import ShopifyIntegrationCard from "@/components/administration/integrations/ShopifyIntegrationCard";
import ShopifyInventorySyncPanel from "@/components/administration/integrations/ShopifyInventorySyncPanel";
import ShopifyFinanceSyncPanel from "@/components/administration/integrations/ShopifyFinanceSyncPanel";

export default async function ShopifyConnectPage({ params, searchParams }) {
  const resolved = await params;
  const organizationId = String(resolved?.organizationId || "").trim();
  const resolvedSearch = await searchParams;
  const onboarding = String(resolvedSearch?.onboarding || "") === "1";

  return (
    <div className={onboarding ? "min-h-screen bg-[#F7F6F3]" : "min-h-screen bg-black"}>
      <ShopifyIntegrationCard organizationId={organizationId} onboarding={onboarding} />
      {!onboarding ? <ShopifyInventorySyncPanel organizationId={organizationId} /> : null}
      {!onboarding ? <ShopifyFinanceSyncPanel organizationId={organizationId} /> : null}
    </div>
  );
}
