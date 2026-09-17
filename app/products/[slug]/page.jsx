import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import ProductFamilyArt from "@/components/public/ProductFamilyArt";
import { productCatalog } from "@/components/public/productCatalog";
import { publicStatus } from "@/components/public/productStatus";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  return productCatalog.filter((product) => !product.href).map((product) => ({ slug: product.id }));
}

export function generateMetadata({ params }) {
  const product = productCatalog.find((item) => item.id === params.slug);
  if (!product) return {};
  return {
    title: `${product.name} | Avantiqo Products`,
    description: product.summary,
  };
}

function Arrow(){return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
export default function CatalogProductPage({ params }) {
  const product = productCatalog.find((item) => item.id === params.slug);
  if (!product) notFound();
  const status = publicStatus(product);
  return <main className="min-h-screen bg-[#F7F6F3] text-[#171614]">
    <PublicSiteHeader context={product.name} audience="business" />
    <section className="border-b border-[#BDAF9E]/30 bg-[#F3EEE5]">
      <div className="mx-auto grid max-w-[1540px] gap-12 px-5 py-16 sm:px-7 lg:grid-cols-[1.05fr_.95fr] lg:px-10 lg:py-24 xl:px-14">
        <div><p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A744B]">AVANTIQO PRODUCT CATALOG</p><h1 className="mt-4 text-[56px] font-medium leading-[.94] tracking-[-.065em] sm:text-[72px]">{product.name}</h1><p className="mt-7 max-w-3xl text-[16px] leading-8 text-[#625D55]">{product.summary}</p><div className="mt-8 flex flex-wrap gap-2"><span className="rounded-full border border-[#D6A66A]/30 bg-[#FBFAF8] px-3 py-2 text-[8px] font-semibold uppercase tracking-[.12em] text-[#8D653E]">{status.label}</span>{product.api?<span className="rounded-full border border-[#BDAF9E]/35 bg-[#FBFAF8] px-3 py-2 text-[8px] font-semibold uppercase tracking-[.12em] text-[#625D55]">Developer API candidate</span>:null}</div></div>
        <div><ProductFamilyArt family={product.family} product={product}/><div className="mt-3 rounded-[22px] border border-[#BDAF9E]/35 bg-[#FBFAF8] p-5"><div className="text-[7px] font-semibold uppercase tracking-[.15em] text-[#9A744B]">Product profile</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><div className="text-[7px] uppercase tracking-[.12em] text-[#8A8177]">Primary buyers</div><div className="mt-1 text-[10px] leading-5 text-[#5F5952]">{product.buyers}</div></div><div><div className="text-[7px] uppercase tracking-[.12em] text-[#8A8177]">Availability</div><div className="mt-1 text-[10px] leading-5 text-[#5F5952]">{status.label}</div></div></div></div></div>
      </div>
    </section>
    <section className="border-b border-[#BDAF9E]/30 bg-[#FBFAF8]"><div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-22"><p className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#9A744B]">WHERE THIS PRODUCT FITS</p><div className="mt-6 grid gap-3 md:grid-cols-2"><div className="rounded-[24px] border border-[#BDAF9E]/35 bg-white p-6"><h2 className="text-[22px] font-semibold tracking-[-.03em]">Sell it as a focused product</h2><p className="mt-3 text-[11px] leading-6 text-[#716A62]">Customers can adopt {product.name} without buying the full Business OS. It keeps the same organization, identity, permissions, evidence and governance underneath.</p></div><div className="rounded-[24px] border border-[#BDAF9E]/35 bg-white p-6"><h2 className="text-[22px] font-semibold tracking-[-.03em]">Reuse the same engine elsewhere</h2><p className="mt-3 text-[11px] leading-6 text-[#716A62]">The {product.engine} engine can also power industry solutions, automations and developer-facing capabilities instead of becoming a separate codebase.</p></div></div><div className="mt-8"><div className="text-[7px] font-semibold uppercase tracking-[.15em] text-[#9A744B]">Industry / packaging opportunities</div><div className="mt-3 flex flex-wrap gap-2">{product.verticals.map((vertical)=><span key={vertical} className="rounded-full border border-[#BDAF9E]/35 bg-white px-3 py-2 text-[8px] text-[#655F57]">{vertical}</span>)}</div></div></div></section>
    <section className="bg-[#171614] text-white"><div className="mx-auto grid max-w-[1320px] gap-8 px-5 py-16 sm:px-7 lg:grid-cols-[1fr_auto] lg:items-center lg:px-10 lg:py-20"><div><p className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#D6A66A]">PRODUCT JOURNEY</p><h2 className="mt-3 text-[34px] font-medium tracking-[-.045em]">Start focused. Expand when the business needs more.</h2><p className="mt-3 max-w-3xl text-[11px] leading-6 text-white/45">Each focused product uses the same Avantiqo organization, identity, permissions, evidence and governance underneath, so customers can add more capabilities without rebuilding their operating context.</p></div><div className="flex flex-wrap gap-2"><a href="/products" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#D6A66A] px-5 text-[10px] font-semibold text-[#3F3327]">All products <Arrow/></a>{product.api?<a href="/developers/capabilities" className="inline-flex h-11 items-center rounded-full border border-white/20 px-5 text-[10px] font-semibold text-white/80">Developer capabilities</a>:null}</div></div></section>
  </main>;
}
