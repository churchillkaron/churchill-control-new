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
  const catalogById = useMemo(() => new Map(productCatalog.map((product) => [product.id, product])), []);

  const owned = modules.map((module) => {
    const product = catalogById.get(MODULE_TO_PRODUCT[module.id]);
    const href = resolveWorkspaceRoute({ organizationId, moduleId: module.id, route: module.route });
    return { module, product, href };
  });

  const ownedProductIds = new Set(owned.map((item) => item.product?.id).filter(Boolean));
  const explore = productCatalog.filter((product) => isCustomerProduct(product) && !ownedProductIds.has(product.id)).slice(0, 12);

  return <div className="mx-auto max-w-[1380px] text-[#191919]">
    <section className="border-b border-black/[.07] pb-8">
      <div className="text-[9px] font-semibold uppercase tracking-[.2em] text-[#A37849]">Your Avantiqo</div>
      <h1 className="mt-3 text-[42px] font-medium tracking-[-.05em] md:text-[54px]">Products your business can use now.</h1>
      <p className="mt-4 max-w-3xl text-[13px] leading-7 text-[#6D6861]">These products are enabled for this organization. Open one to work, or explore other Avantiqo products when you want to add more.</p>
    </section>

    <section className="py-8">
      <div className="mb-5 text-[10px] font-semibold uppercase tracking-[.16em] text-[#858078]">Your products</div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {owned.map(({ module, product, href }) => <Link key={module.id} href={href || "#"} className="rounded-[20px] border border-black/[.07] bg-white p-5 transition hover:border-[#D6A66A]/50">
          <div className="text-[9px] font-semibold uppercase tracking-[.15em] text-[#A37849]">Enabled</div>
          <h2 className="mt-3 text-[22px] font-medium tracking-[-.035em]">{product?.name || module.name || module.id}</h2>
          <p className="mt-3 text-[11px] leading-6 text-[#716C65]">{product?.summary || module.description || "Available in your Avantiqo workspace."}</p>
          <div className="mt-5 text-[9px] font-semibold text-[#76502E]">Open product →</div>
        </Link>)}
      </div>
    </section>

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
