import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import ProductFamilyArt from "@/components/public/ProductFamilyArt";
import ProductControlIndex from "@/components/public/ProductControlIndex";
import { productCatalog, productCatalogByFamily } from "@/components/public/productCatalog";
import { publicStatus, publicStatusKey } from "@/components/public/productStatus";

function Arrow(){return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}

const statusClass = {
  available: "border-[#B58A55]/35 bg-[#F4EBDD] text-[#6E4E2D]",
  early_access: "border-[#B58A55]/28 bg-[#F7F1E8] text-[#795C39]",
  coming_soon: "border-[#BDAF9E]/35 bg-[#F7F6F3] text-[#8A847C]",
};

function ProductCard({ product }) {
  const status = publicStatus(product);
  const statusKey = publicStatusKey(product);
  return <article id={product.id} className="group flex h-full flex-col rounded-[24px] border border-[#BDAF9E]/35 bg-white p-5 shadow-[0_12px_38px_rgba(45,32,20,.025)] transition hover:-translate-y-0.5 hover:border-[#D6A66A]/35 hover:shadow-[0_20px_54px_rgba(45,32,20,.06)]">
    <div className="flex items-start justify-between gap-3">
      <span className={`rounded-full border px-2.5 py-1 text-[7px] font-bold uppercase tracking-[.12em] ${statusClass[statusKey]}`}>{status.label}</span>
      {product.api ? <span className="rounded-full border border-[#D6A66A]/22 bg-[#FAF6EF] px-2.5 py-1 text-[7px] font-bold uppercase tracking-[.12em] text-[#9A744B]">API</span> : null}
    </div>
    <h3 className="mt-6 text-[19px] font-semibold tracking-[-.025em] text-[#27231F]">{product.name}</h3>
    <p className="mt-2 text-[10px] leading-5 text-[#746E66]">{product.summary}</p>
    <div className="mt-5 border-t border-[#BDAF9E]/30 pt-4">
      <div className="text-[7px] font-semibold uppercase tracking-[.14em] text-[#A17A51]">Engine</div>
      <div className="mt-1 text-[9px] font-medium text-[#4C4640]">{product.engine}</div>
      <div className="mt-4 text-[7px] font-semibold uppercase tracking-[.14em] text-[#A17A51]">Built for</div>
      <div className="mt-1 text-[9px] leading-5 text-[#716A62]">{product.buyers}</div>
    </div>
    <div className="mt-4 flex flex-wrap gap-1.5">{product.verticals.slice(0,5).map((vertical)=><span key={vertical} className="rounded-full border border-[#BDAF9E]/30 bg-[#F7F5F1] px-2.5 py-1 text-[7px] text-[#706960]">{vertical}</span>)}</div>
    <div className="mt-auto pt-6">{<a href={product.href || `/products/${product.id}`} className="inline-flex items-center gap-2 text-[9px] font-semibold text-[#8E653D] transition group-hover:text-[#5D4127]">{product.href ? 'Open product' : 'Open catalog entry'} <Arrow/></a>}</div>
  </article>;
}

export default function ProductsCatalogPage(){
  const counts = productCatalog.reduce((acc,p)=>{const key=publicStatusKey(p);acc[key]=(acc[key]||0)+1;return acc;},{});
  return <main className="min-h-screen bg-[#F7F6F3] text-[#171614]">
    <PublicSiteHeader context="Products" audience="business" />
    <section className="relative overflow-hidden border-b border-[#BDAF9E]/30 bg-[#F3EEE5]">
      <div className="absolute inset-0 opacity-60 bg-[radial-gradient(circle_at_15%_0%,rgba(214,166,106,.28),transparent_28%),radial-gradient(circle_at_90%_35%,rgba(214,166,106,.11),transparent_30%)]" />
      <div className="relative mx-auto max-w-[1540px] px-5 py-16 sm:px-7 lg:px-10 lg:py-24 xl:px-14">
        <p className="text-[9px] font-semibold uppercase tracking-[.24em] text-[#9A744B]">THE AVANTIQO PRODUCT MAP</p>
        <div className="mt-4 grid gap-10 lg:grid-cols-[1.25fr_.75fr] lg:items-end">
          <div><h1 className="max-w-[980px] text-[54px] font-medium leading-[.93] tracking-[-.065em] sm:text-[72px] lg:text-[88px]">Everything we can build, sell and finish.</h1><p className="mt-7 max-w-[850px] text-[15px] leading-8 text-[#645E56]">One canonical catalog for the complete Avantiqo portfolio — from products available now and early-access products to the next focused products entering the Avantiqo portfolio.</p></div>
          <div className="grid grid-cols-2 gap-2 rounded-[26px] border border-[#BDAF9E]/35 bg-[#FBFAF8] p-3 backdrop-blur-sm">
            {[['available','Available'],['early_access','Early Access'],['coming_soon','Coming Soon'],['total','Products']].map(([key,label])=><div key={key} className="rounded-[18px] border border-black/[.055] bg-[#FBFAF8] p-4"><div className="text-[27px] font-medium tracking-[-.05em]">{key==='total'?productCatalog.length:(counts[key]||0)}</div><div className="mt-1 text-[7px] font-semibold uppercase tracking-[.13em] text-[#8A8177]">{label}</div></div>)}
          </div>
        </div>
        <div className="mt-10 flex flex-wrap gap-2">{productCatalogByFamily.map((family)=><a key={family.id} href={`#${family.id}`} className="rounded-full border border-[#BDAF9E]/35 bg-white/60 px-3.5 py-2 text-[8px] font-semibold text-[#5F584F] transition hover:border-[#D6A66A]/45 hover:bg-white">{family.label}</a>)}</div>
      </div>
    </section>

    <section className="border-b border-[#BDAF9E]/30 bg-[#171614] text-white"><div className="mx-auto grid max-w-[1540px] gap-6 px-5 py-9 sm:px-7 lg:grid-cols-[.7fr_1.3fr] lg:px-10 xl:px-14"><div><p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#D6A66A]">HOW TO READ THIS CATALOG</p></div><div className="grid gap-4 text-[10px] leading-5 text-white/52 sm:grid-cols-3"><p><strong className="text-white/78">Available</strong><br/>Ready to adopt as a product today.</p><p><strong className="text-white/78">Early Access</strong><br/>A substantial product is available to selected customers while the final release path is completed.</p><p><strong className="text-white/78">Coming Soon</strong><br/>Part of the Avantiqo product portfolio and moving toward a focused commercial release.</p></div></div></section>

    <ProductControlIndex products={productCatalog} families={productCatalogByFamily} />

    {productCatalogByFamily.map((family,index)=><section key={family.id} id={family.id} className={`scroll-mt-24 border-b border-[#BDAF9E]/30 ${index%2===0?'bg-[#FBFAF8]':'bg-[#F3EFE7]'}`}><div className="mx-auto max-w-[1540px] px-5 py-16 sm:px-7 lg:px-10 lg:py-22 xl:px-14">
      <div className="grid gap-8 lg:grid-cols-[.62fr_1.38fr] lg:items-start"><div className="pt-1"><div className="text-[8px] font-bold text-[#A37849]">{String(index+1).padStart(2,'0')}</div><h2 className="mt-3 text-[38px] font-medium tracking-[-.05em] sm:text-[48px]">{family.label}</h2><p className="mt-5 max-w-md text-[12px] leading-6 text-[#726B63]">{family.description}</p></div><ProductFamilyArt family={family.id} product={{name: family.label, engine: `${family.products.length} catalogued products`}} /></div>
      <div className="mt-9 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{family.products.map((product)=><ProductCard key={product.id} product={product}/>)}</div>
    </div></section>)}

    <section className="bg-[#171614] text-white"><div className="mx-auto max-w-[1180px] px-5 py-20 text-center sm:px-7 lg:px-10 lg:py-28"><p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#D6A66A]">ONE PLATFORM. MANY SELLABLE ENTRY POINTS.</p><h2 className="mx-auto mt-4 max-w-5xl text-[42px] font-medium leading-[.98] tracking-[-.055em] sm:text-[60px]">Finish products one by one without losing the full Avantiqo map.</h2><p className="mx-auto mt-6 max-w-3xl text-[13px] leading-7 text-white/45">Each product can mature independently while sharing organization context, identity, permissions, evidence, intelligence, governance, wallet, APIs and the same underlying engines.</p><div className="mt-8 flex flex-wrap justify-center gap-2.5"><a href="/developers" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#D6A66A] px-5 text-[10px] font-semibold text-[#3F3327]">Developer capabilities <Arrow/></a><a href="/solutions" className="inline-flex h-11 items-center rounded-full border border-white/20 px-5 text-[10px] font-semibold text-white/80">Industry solutions</a></div></div></section>
  </main>;
}
