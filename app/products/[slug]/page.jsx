import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import { productCatalog } from "@/components/public/productCatalog";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  return productCatalog.filter((product) => !product.href).map((product) => ({ slug: product.id }));
}

export function generateMetadata({ params }) {
  const product = productCatalog.find((item) => item.id === params.slug);
  if (!product) return {};
  return { title: `${product.name} | Avantiqo`, description: product.summary };
}

export default function CatalogProductPage({ params }) {
  const product = productCatalog.find((item) => item.id === params.slug);
  if (!product) notFound();
  return <main className="min-h-screen bg-[#F7F6F3] text-[#171614]">
    <PublicSiteHeader context={product.name} audience="business" />
    <section className="relative overflow-hidden border-b border-[#CFC5B8]/45 bg-[#F3EEE5]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(214,166,106,.22),transparent_30%)]" />
      <div className="relative mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-28">
        <p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A744B]">AVANTIQO {product.name.toUpperCase()}</p>
        <h1 className="mt-4 max-w-5xl text-[58px] font-medium leading-[.94] tracking-[-.065em] sm:text-[76px]">{product.summary}</h1>
        <p className="mt-8 max-w-3xl text-[15px] leading-8 text-[#625D55]">Built for {product.buyers}. Start with this product on its own, then connect more Avantiqo products as your operation grows.</p>
        <div className="mt-8 flex flex-wrap gap-x-4 gap-y-2 text-[9px] text-[#756B60]">{product.verticals.map((vertical)=><span key={vertical}>{vertical}</span>)}</div>
        <div className="mt-10"><a href="/start" className="inline-flex h-11 items-center rounded-full bg-[#D6A66A] px-5 text-[10px] font-semibold text-[#3F3327]">Start with {product.name}</a></div>
      </div>
    </section>
    <section className="border-b border-[#CFC5B8]/45 bg-[#FBFAF8]"><div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-24">
      <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end"><div><p className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#9A744B]">WHY THIS PRODUCT</p><h2 className="mt-3 text-[40px] font-medium tracking-[-.05em] sm:text-[54px]">Solve the job without buying more than you need.</h2></div><p className="max-w-2xl text-[13px] leading-7 text-[#706A62] lg:justify-self-end">{product.summary} Avantiqo keeps the same business identity and operating context underneath so you can expand without rebuilding your setup.</p></div>
      <div className="mt-10 grid gap-x-8 gap-y-8 md:grid-cols-3">
        <div className="border-t border-[#CFC5B8] pt-5"><div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">For your team</div><p className="mt-3 text-[11px] leading-6 text-[#716A62]">Give the people doing the work one focused place to handle this part of the operation.</p></div>
        <div className="border-t border-[#CFC5B8] pt-5"><div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">For management</div><p className="mt-3 text-[11px] leading-6 text-[#716A62]">Keep activity, exceptions and business evidence connected instead of spread across separate tools.</p></div>
        <div className="border-t border-[#CFC5B8] pt-5"><div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">For growth</div><p className="mt-3 text-[11px] leading-6 text-[#716A62]">Add finance, workforce, customer, inventory, intelligence or other Avantiqo products when they become useful.</p></div>
      </div>
    </div></section>
    <section className="bg-[#171614] text-white"><div className="mx-auto grid max-w-[1320px] gap-8 px-5 py-16 sm:px-7 lg:grid-cols-[1fr_auto] lg:items-center lg:px-10 lg:py-20"><div><p className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#D6A66A]">ONE BUSINESS. ONE FOUNDATION.</p><h2 className="mt-3 text-[36px] font-medium tracking-[-.045em]">Start with {product.name}. Connect more when you need them.</h2><p className="mt-3 max-w-3xl text-[11px] leading-6 text-white/50">Your organization, people and business context stay connected as you expand across Avantiqo.</p></div><a href="/products" className="inline-flex h-11 items-center rounded-full border border-white/20 px-5 text-[10px] font-semibold text-white/80">Explore all products</a></div></section>
  </main>;
}
