import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import ProductFinder from "@/components/public/ProductControlIndex";
import { productCatalog, productCatalogByFamily } from "@/components/public/productCatalog";

function ProductCard({ product }) {
  return <article id={product.id} className="flex h-full flex-col border-t border-[#CFC5B8] py-5">
    <div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">{product.buyers}</div>
    <h3 className="mt-3 text-[22px] font-medium tracking-[-.035em] text-[#28241F]">{product.name}</h3>
    <p className="mt-3 max-w-[36rem] text-[11px] leading-6 text-[#716A62]">{product.summary}</p>
    <div className="mt-5 flex flex-wrap gap-x-3 gap-y-1 text-[8px] text-[#8B8176]">{product.verticals.slice(0,4).map((vertical)=><span key={vertical}>{vertical}</span>)}</div>
    <div className="mt-auto pt-6"><a href={product.href || `/products/${product.id}`} className="text-[9px] font-semibold text-[#815B36] transition hover:text-[#4E3520]">Explore {product.name}</a></div>
  </article>;
}

export default function ProductsCatalogPage(){
  return <main className="min-h-screen bg-[#F7F6F3] text-[#171614]">
    <PublicSiteHeader context="Products" audience="business" />
    <section className="relative overflow-hidden border-b border-[#CFC5B8]/55 bg-[#F3EEE5]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(214,166,106,.24),transparent_30%),radial-gradient(circle_at_88%_40%,rgba(214,166,106,.10),transparent_30%)]" />
      <div className="relative mx-auto max-w-[1540px] px-5 py-20 sm:px-7 lg:px-10 lg:py-28 xl:px-14">
        <p className="text-[9px] font-semibold uppercase tracking-[.24em] text-[#9A744B]">AVANTIQO PRODUCTS</p>
        <h1 className="mt-5 max-w-[1080px] text-[56px] font-medium leading-[.93] tracking-[-.065em] sm:text-[76px] lg:text-[96px]">Run more of your business from one place.</h1>
        <p className="mt-8 max-w-[820px] text-[16px] leading-8 text-[#625D55]">Choose the products you need today — from workforce, finance and inventory to customer operations, documents, intelligence and creative production. Add more when your business is ready.</p>
        <div className="mt-10 flex flex-wrap gap-x-5 gap-y-3">{productCatalogByFamily.map((family)=><a key={family.id} href={`#${family.id}`} className="border-b border-[#B79A77] pb-1 text-[9px] font-semibold text-[#5F584F] transition hover:border-[#815B36] hover:text-[#815B36]">{family.label}</a>)}</div>
      </div>
    </section>

    <section className="border-b border-[#CFC5B8]/45 bg-[#171614] text-white"><div className="mx-auto grid max-w-[1540px] gap-8 px-5 py-10 sm:px-7 lg:grid-cols-[.75fr_1.25fr] lg:px-10 xl:px-14"><div><p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#D6A66A]">START WITH THE JOB</p><h2 className="mt-3 text-[30px] font-medium tracking-[-.04em]">You do not need to buy a giant suite.</h2></div><p className="max-w-3xl text-[12px] leading-6 text-white/58">Start with the part of the business you want to improve. Avantiqo keeps the same people, customer, financial and operating context underneath, so adding another product later does not mean starting over.</p></div></section>

    <ProductFinder products={productCatalog} families={productCatalogByFamily} />

    {productCatalogByFamily.map((family,index)=><section key={family.id} id={family.id} className={`scroll-mt-24 border-b border-[#CFC5B8]/45 ${index%2===0?'bg-[#FBFAF8]':'bg-[#F3EFE7]'}`}><div className="mx-auto max-w-[1540px] px-5 py-16 sm:px-7 lg:px-10 lg:py-24 xl:px-14">
      <div className="grid gap-8 lg:grid-cols-[.58fr_1.42fr] lg:items-end">
        <div><div className="text-[8px] font-bold text-[#A37849]">{String(index+1).padStart(2,'0')}</div><h2 className="mt-3 text-[42px] font-medium tracking-[-.055em] sm:text-[56px]">{family.label}</h2></div>
        <p className="max-w-3xl text-[14px] leading-7 text-[#6F685F] lg:justify-self-end">{family.description}</p>
      </div>
      <div className="mt-10 grid gap-x-8 md:grid-cols-2 xl:grid-cols-3">{family.products.map((product)=><ProductCard key={product.id} product={product}/>)}</div>
    </div></section>)}

    <section className="bg-[#171614] text-white"><div className="mx-auto grid max-w-[1320px] gap-8 px-5 py-20 sm:px-7 lg:grid-cols-[1fr_auto] lg:items-center lg:px-10 lg:py-24"><div><p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#D6A66A]">BUILD YOUR AVANTIQO</p><h2 className="mt-4 max-w-4xl text-[44px] font-medium leading-[.98] tracking-[-.055em] sm:text-[60px]">Start where the pain is. Expand from there.</h2><p className="mt-5 max-w-3xl text-[13px] leading-7 text-white/50">Workforce, finance, inventory, customer operations, documents and creative production can each stand on their own — and work better together when you add more.</p></div><div><a href="/start" className="inline-flex h-11 items-center rounded-full bg-[#D6A66A] px-5 text-[10px] font-semibold text-[#3F3327]">Talk to Avantiqo</a></div></div></section>
  </main>;
}
