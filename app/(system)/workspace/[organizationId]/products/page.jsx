"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import { productCatalog } from "@/components/public/productCatalog";
import { isCustomerProduct } from "@/components/public/customerProductGroups";
import { resolveWorkspaceRoute } from "@/lib/platform/routing/resolveWorkspaceRoute";

const MODULE_TO_PRODUCT = {
  hr: "workforce", schedule: "scheduling", payroll: "payroll", finance: "finance", accounting: "finance",
  inventory: "inventory", procurement: "procurement", pos: "pos", reservations: "reservations",
  frontdesk: "front-desk", housekeeping: "housekeeping", concierge: "concierge", crm: "crm",
  marketing_ai: "marketing", customer_portal: "customer-portal", projects: "projects", automation: "automations",
  analytics: "insights", design_studio: "creative-studio", hotel: "hotel-system", maintenance: "maintenance",
};

function productHref(product) { return product.href || `/products/${product.id}`; }

export default function WorkspaceProductsPage({ params }) {
  const context = useBusinessContext() || {};
  const organizationId = params?.organizationId || context.organization_id || context.organization?.id;
  const modules = Array.isArray(context.modules) ? context.modules : [];
  const entitlements = Array.isArray(context.product_entitlements) ? context.product_entitlements : [];
  const catalogById = useMemo(() => new Map(productCatalog.map((product) => [product.id, product])), []);

  const entitledProducts = entitlements
    .map((entitlement) => catalogById.get(entitlement.product_id))
    .filter((product) => product && isCustomerProduct(product));

  const enabledAreas = modules.map((module) => {
    const product = catalogById.get(MODULE_TO_PRODUCT[module.id]);
    const href = resolveWorkspaceRoute({ organizationId, moduleId: module.id, route: module.route });
    return { module, product, href };
  });

  const entitledProductIds = new Set(entitledProducts.map((product) => product.id));
  const explore = productCatalog
    .filter((product) => isCustomerProduct(product) && !entitledProductIds.has(product.id))
    .slice(0, 12);
  const hasExactEntitlements = entitledProducts.length > 0;

  return <div className="mx-auto max-w-[1380px] text-[#191919]">
    <section className="border-b border-black/[.07] pb-8">
      <div className="text-[9px] font-semibold uppercase tracking-[.2em] text-[#A37849]">Your Avantiqo</div>
      <h1 className="mt-3 text-[42px] font-medium tracking-[-.05em] md:text-[54px]">{hasExactEntitlements ? "Products your business owns." : "What your organization can use today."}</h1>
      <p className="mt-4 max-w-3xl text-[13px] leading-7 text-[#6D6861]">{hasExactEntitlements ? "These are the Avantiqo products assigned to this organization. Open your workspace to use them, or explore what you can add next." : "Your workspace already has business areas enabled. Exact commercial product ownership has not been assigned yet, so Avantiqo keeps access and purchasing separate."}</p>
    </section>

    {hasExactEntitlements ? (
      <section className="py-8">
        <div className="mb-5 text-[10px] font-semibold uppercase tracking-[.16em] text-[#858078]">Your products</div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {entitledProducts.map((product) => <Link key={product.id} href={productHref(product)} className="rounded-[20px] border border-black/[.07] bg-white p-5 transition hover:border-[#D6A66A]/50">
            <div className="text-[9px] font-semibold uppercase tracking-[.15em] text-[#A37849]">Active product</div>
            <h2 className="mt-3 text-[22px] font-medium tracking-[-.035em]">{product.name}</h2>
            <p className="mt-3 text-[11px] leading-6 text-[#716C65]">{product.summary}</p>
            <div className="mt-5 text-[9px] font-semibold text-[#76502E]">View product →</div>
          </Link>)}
        </div>
      </section>
    ) : (
      <section className="py-8">
        <div className="mb-5 text-[10px] font-semibold uppercase tracking-[.16em] text-[#858078]">Enabled business areas</div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {enabledAreas.map(({ module, product, href }) => <Link key={module.id} href={href || "#"} className="rounded-[20px] border border-black/[.07] bg-white p-5 transition hover:border-[#D6A66A]/50">
            <div className="text-[9px] font-semibold uppercase tracking-[.15em] text-[#A37849]">Available in this workspace</div>
            <h2 className="mt-3 text-[22px] font-medium tracking-[-.035em]">{product?.name || module.name || module.id}</h2>
            <p className="mt-3 text-[11px] leading-6 text-[#716C65]">{product?.summary || module.description || "Available in your Avantiqo workspace."}</p>
            <div className="mt-5 text-[9px] font-semibold text-[#76502E]">Open workspace →</div>
          </Link>)}
        </div>
      </section>
    )}

    <section className="border-t border-black/[.07] py-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#858078]">Explore more Avantiqo</div><h2 className="mt-2 text-[30px] font-medium tracking-[-.04em]">Add what your business needs next.</h2></div>
        <Link href="/products" className="text-[10px] font-semibold text-[#76502E]">View all customer products →</Link>
      </div>
      <div className="mt-6 grid gap-x-7 gap-y-2 md:grid-cols-2 xl:grid-cols-3">
        {explore.map((product) => <Link key={product.id} href={productHref(product)} className="border-t border-black/[.08] py-4 transition hover:border-[#D6A66A]">
          <div className="text-[13px] font-semibold text-[#2D2925]">{product.name}</div>
          <p className="mt-2 text-[10px] leading-5 text-[#7B756E]">{product.summary}</p>
          <div className="mt-3 text-[9px] font-semibold text-[#8A6138]">Explore product →</div>
        </Link>)}
      </div>
    </section>
  </div>;
}
