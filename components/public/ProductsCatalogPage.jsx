import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import ProductFinder from "@/components/public/ProductControlIndex";
import { productCatalog } from "@/components/public/productCatalog";
import { CUSTOMER_GROUPS, CUSTOMER_FEATURES, isCustomerProduct } from "@/components/public/customerProductGroups";

const customerProducts = productCatalog.filter(isCustomerProduct);
const byId = Object.fromEntries(customerProducts.map((product) => [product.id, product]));

function ProductLink({ product }) {
  if (!product) return null;
  return <a href={product.href || `/products/${product.id}`} className="group block border-t border-[#CFC5B8]/60 py-4 transition hover:border-[#9E774B]">
    <div className="flex items-start justify-between gap-4"><div><div className="text-[15px] font-semibold tracking-[-.025em] text-[#29251F]">{product.name}</div><div className="mt-1 max-w-xl text-[9px] leading-5 text-[#766F67]">{product.summary}</div></div><span className="shrink-0 pt-1 text-[8px] font-semibold text-[#8A633C]">Explore</span></div>
  </a>;
}

export default function ProductsCatalogPage(){
  return <main className="min-h-screen bg-[#F7F6F3] text-[#171614]">
    <PublicSiteHeader context="Products" audience="business" />
    <section className="relative overflow-hidden border-b border-[#CFC5B8]/55 bg-[#F3EEE5]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(214,166,106,.24),transparent_30%),radial-gradient(circle_at_88%_40%,rgba(214,166,106,.10),transparent_30%)]" />
      <div className="relative mx-auto max-w-[1540px] px-5 py-20 sm:px-7 lg:px-10 lg:py-28 xl:px-14">
        <p className="text-[9px] font-semibold uppercase tracking-[.24em] text-[#9A744B]">AVANTIQO PRODUCTS</p>
        <h1 className="mt-5 max-w-[1080px] text-[56px] font-medium leading-[.93] tracking-[-.065em] sm:text-[76px] lg:text-[96px]">Start with what your business needs now.</h1>
        <p className="mt-8 max-w-[820px] text-[16px] leading-8 text-[#625D55]">Choose a focused product, solve one part of the business, and add more when it makes sense. Avantiqo is designed to grow with you without forcing a complete system change on day one.</p>
      </div>
    </section>
    <section className="border-b border-[#CFC5B8]/45 bg-[#FBFAF8]"><div className="mx-auto max-w-[1540px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
      <div className="grid gap-6 lg:grid-cols-[.65fr_1.35fr] lg:items-end"><div><p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#9A744B]">CHOOSE BY BUSINESS NEED</p><h2 className="mt-3 text-[40px] font-medium leading-[1] tracking-[-.05em] sm:text-[54px]">Where do you want to improve first?</h2></div><p className="max-w-2xl text-[12px] leading-6 text-[#6E675F] lg:justify-self-end">Choose the business problem you want to solve. Avantiqo shows the products that help you do it.</p></div>
      <div className="mt-10 grid gap-x-8 md:grid-cols-2 xl:grid-cols-4">{CUSTOMER_GROUPS.map((group)=><a key={group.id} href={`#${group.id}`} className="group border-t border-[#CFC5B8] py-6 transition hover:border-[#9E774B]"><div className="text-[8px] font-semibold uppercase tracking-[.14em] text-[#A37849]">{group.label}</div><h3 className="mt-4 text-[23px] font-medium leading-[1.05] tracking-[-.04em] text-[#29251F]">{group.headline}</h3><p className="mt-3 text-[10px] leading-5 text-[#756E66]">{group.description}</p><div className="mt-5 text-[8px] font-semibold text-[#815B36]">Explore this area</div></a>)}</div>
    </div></section>

    <section className="border-b border-[#CFC5B8]/45 bg-[#171614] text-white"><div className="mx-auto grid max-w-[1540px] gap-8 px-5 py-10 sm:px-7 lg:grid-cols-[.75fr_1.25fr] lg:px-10 xl:px-14"><div><p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#D6A66A]">BUILT AROUND YOUR BUSINESS</p><h2 className="mt-3 text-[30px] font-medium tracking-[-.04em]">Start focused. Expand when you are ready.</h2></div><p className="max-w-3xl text-[12px] leading-6 text-white/58">A restaurant can start with POS. A hotel can start with front desk. An employer can start with Workforce. A finance team can start with invoicing. Add the rest only when it creates value.</p></div></section>

    {CUSTOMER_GROUPS.map((group,index)=>{
      const featured=(CUSTOMER_FEATURES[group.id]||[]).map((id)=>byId[id]).filter(Boolean);
      return <section key={group.id} id={group.id} className={`scroll-mt-24 border-b border-[#CFC5B8]/45 ${index%2===0?'bg-[#F3EFE7]':'bg-[#FBFAF8]'}`}><div className="mx-auto max-w-[1540px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
        <div className="grid gap-8 lg:grid-cols-[.7fr_1.3fr] lg:items-end"><div><div className="text-[8px] font-semibold uppercase tracking-[.17em] text-[#A37849]">{String(index+1).padStart(2,'0')} · {group.label}</div><h2 className="mt-3 text-[40px] font-medium leading-[1] tracking-[-.05em] sm:text-[54px]">{group.headline}</h2></div><p className="max-w-2xl text-[12px] leading-6 text-[#6E675F] lg:justify-self-end">{group.description}</p></div>
        <div className="mt-10 grid gap-x-8 md:grid-cols-2 lg:grid-cols-3">{featured.map((product)=><ProductLink key={product.id} product={product}/>)}</div>
      </div></section>;
    })}
    <ProductFinder products={customerProducts} groups={CUSTOMER_GROUPS} />

    <section className="border-b border-[#CFC5B8]/45 bg-[#F3EEE5]"><div className="mx-auto grid max-w-[1320px] gap-8 px-5 py-16 sm:px-7 lg:grid-cols-[1fr_auto] lg:items-center lg:px-10"><div><p className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#9A744B]">BUILDING WITH AVANTIQO?</p><h2 className="mt-3 text-[34px] font-medium tracking-[-.045em]">APIs, integrations and platform tools live in Developers.</h2><p className="mt-3 max-w-3xl text-[11px] leading-6 text-[#6F685F]">Business teams can stay focused on products and outcomes, while developers get a separate area for APIs, integrations and technical tools.</p></div><a href="/developers" className="text-[10px] font-semibold text-[#815B36]">Explore Developers</a></div></section>

    <section className="bg-[#171614] text-white"><div className="mx-auto grid max-w-[1320px] gap-8 px-5 py-20 sm:px-7 lg:grid-cols-[1fr_auto] lg:items-center lg:px-10 lg:py-24"><div><p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#D6A66A]">BUILD YOUR AVANTIQO</p><h2 className="mt-4 max-w-4xl text-[44px] font-medium leading-[.98] tracking-[-.055em] sm:text-[60px]">Start with what matters now. Expand from there.</h2><p className="mt-5 max-w-3xl text-[13px] leading-7 text-white/50">Choose the product that solves today's problem. Add connected products when they create the next piece of value.</p></div><div><a href="/start" className="inline-flex h-11 items-center rounded-full bg-[#D6A66A] px-5 text-[10px] font-semibold text-[#3F3327]">Talk to Avantiqo</a></div></div></section>
  </main>;
}
