import ProductControlCockpit from "@/components/workspace/administration/ProductControlCockpit";
import { productControlCatalog } from "@/components/public/productControlCatalog";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export const dynamic = "force-dynamic";

const OWNER_ROLES = new Set(["OWNER", "ORGANIZATION_OWNER", "ORG_OWNER", "PLATFORM_OWNER", "SUPER_ADMIN"]);

export default async function ProductControlPage({ params }) {
  const organizationId = String(params?.organizationId || "").trim();
  const access = await requireOrganizationAccess({ organizationId }).catch(() => ({ success: false }));
  const role = String(access?.role || "").trim().toUpperCase();

  if (!access?.success || !OWNER_ROLES.has(role)) {
    return <div className="mx-auto max-w-3xl rounded-[26px] border border-black/[.08] bg-white p-7 text-[#1B1A18]"><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#A37849]">Owner access required</div><h1 className="mt-3 text-2xl font-semibold">Product Control is restricted.</h1><p className="mt-3 text-[12px] leading-6 text-[#6F6B64]">This portfolio controls internal product readiness and is available only to organization/platform owners and super administrators.</p></div>;
  }

  return <ProductControlCockpit records={productControlCatalog} />;
}
