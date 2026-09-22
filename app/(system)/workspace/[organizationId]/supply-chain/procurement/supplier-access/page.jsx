import SupplierPortalAccessWorkCenter from "@/components/workspace/supply-chain/SupplierPortalAccessWorkCenter";

export const dynamic = "force-dynamic";

export default async function SupplierPortalAccessPage({ params }) {
  const { organizationId } = await params;
  return <SupplierPortalAccessWorkCenter organizationId={organizationId} />;
}
