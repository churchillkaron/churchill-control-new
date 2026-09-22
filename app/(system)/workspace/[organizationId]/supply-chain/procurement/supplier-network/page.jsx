import SupplierNetworkWorkCenter from "@/components/workspace/supply-chain/SupplierNetworkWorkCenter";

export default async function SupplierNetworkPage({ params }) {
  const { organizationId } = await params;
  return <SupplierNetworkWorkCenter organizationId={organizationId} />;
}
