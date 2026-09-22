import { notFound } from "next/navigation";
import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import { getPublicSupplierShop } from "@/lib/supplier-network/SupplierNetworkRuntime";

function money(value, currency = "THB") {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return currency + " " + amount.toFixed(2);
  }
}

export const dynamic = "force-dynamic";

export default async function PublicSupplierShopPage({ params }) {
  const { slug } = await params;
  const shop = await getPublicSupplierShop(slug);
  if (!shop) notFound();

  return <main className="min-h-screen bg-[#F7F3EC] text-[#171614]">
    <PublicSiteHeader context="Supplier Shop" audience="platform" tone="light" action={{ label: "Supplier Login", href: "/login?portal=supplier" }} />
    <section className="border-b border-black/[.06] bg-[linear-gradient(180deg,#F7F0E6_0%,#EFE3D3_100%)]">
      <div className="mx-auto max-w-[1260px] px-5 py-14 sm:px-7 lg:px-10 lg:py-20">
        <div className="flex flex-wrap items-center gap-2 text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">
          <span>Avantiqo Supplier Network</span>
          {shop.supplier?.verified ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[7px] text-emerald-700">Verified</span> : null}
          {shop.supplier?.business_linked ? <span className="rounded-full border border-black/[.08] bg-white/60 px-2 py-1 text-[7px] text-[#5F574F]">Avantiqo Business</span> : null}
        </div>
        <h1 className="mt-4 max-w-4xl text-[46px] font-medium leading-[.96] tracking-[-.055em] sm:text-[64px]">{shop.supplier?.business_name || shop.name}</h1>
        <p className="mt-5 max-w-3xl text-[14px] leading-7 text-[#6B645C]">{shop.headline || shop.description || "Published supplier catalog on Avantiqo."}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <span className="rounded-xl border border-black/[.08] bg-white/60 px-3 py-2 text-[8px] font-semibold">{shop.products.length} products</span>
          <span className="rounded-xl border border-black/[.08] bg-white/60 px-3 py-2 text-[8px] font-semibold">{shop.allow_customer_orders ? "Customer ordering available after connection" : "Catalog only"}</span>
          {shop.supplier?.website ? <a href={shop.supplier.website} target="_blank" rel="noreferrer" className="rounded-xl border border-black/[.08] bg-white/60 px-3 py-2 text-[8px] font-semibold">Supplier website ↗</a> : null}
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-[1260px] px-5 py-10 sm:px-7 lg:px-10">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">Public catalog</div>
          <h2 className="mt-2 text-[30px] font-semibold tracking-[-.035em]">Products</h2>
        </div>
        <a href="/products#supplier-portal" className="text-[9px] font-semibold text-[#815B36]">About Avantiqo Supplier Network →</a>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {shop.products.map((product) => <article key={product.id} className="rounded-[22px] border border-black/[.07] bg-white p-5 shadow-[0_12px_34px_rgba(50,41,31,.035)]">
          <div className="text-[8px] font-semibold uppercase tracking-[.14em] text-[#A37849]">{product.category || "Product"}</div>
          <h3 className="mt-2 text-[18px] font-semibold tracking-[-.025em]">{product.name}</h3>
          {product.description ? <p className="mt-2 text-[9px] leading-5 text-[#756E66]">{product.description}</p> : null}
          <div className="mt-4 grid gap-1 text-[8px] text-[#81786F]">
            {product.sku ? <div>SKU: {product.sku}</div> : null}
            <div>MOQ: {product.minimum_order_quantity} {product.uom || ""}</div>
            <div>Lead time: {Number(product.lead_time_days || 0)} day(s)</div>
          </div>
          <div className="mt-4 text-[15px] font-semibold text-[#76502E]">{money(product.base_price, product.currency_code || shop.currency_code)}</div>
        </article>)}
      </div>
      {!shop.products.length ? <div className="rounded-[22px] border border-black/[.07] bg-white p-8 text-center text-[10px] text-[#81786F]">This supplier has not published any active products yet.</div> : null}

      <div className="mt-8 rounded-[24px] border border-[#B7793B]/20 bg-[#FBF6EF] p-6">
        <div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">Business customers</div>
        <h2 className="mt-2 text-[24px] font-semibold tracking-[-.03em]">Connect through Avantiqo to order and receive your negotiated terms.</h2>
        <p className="mt-3 max-w-3xl text-[9px] leading-5 text-[#756E66]">Public prices are base catalog prices only. Customer-specific pricing, payment terms, orders, invoices and payments remain private to the connected customer relationship.</p>
        <a href="/login?portal=business" className="mt-5 inline-flex rounded-xl bg-[#1D1A17] px-4 py-2.5 text-[9px] font-semibold text-white">Business Login →</a>
      </div>
    </section>
  </main>;
}
