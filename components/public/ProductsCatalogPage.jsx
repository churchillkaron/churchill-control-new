import Image from "next/image";
import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import ProductFinder from "@/components/public/ProductControlIndex";
import { productCatalog } from "@/components/public/productCatalog";
import { CUSTOMER_GROUPS, CUSTOMER_FEATURES, isCustomerProduct } from "@/components/public/customerProductGroups";

const customerProducts = productCatalog.filter(isCustomerProduct);
const GROUP_ART = {
  "run-business": "/art/commercial-commerce.jpg",
  people: "/art/commercial-channels.jpg",
  finance: "/art/commercial-enterprise.jpg",
  stock: "/art/commercial-solutions.jpg",
  documents: "/art/commercial-integrations.jpg",
  intelligence: "/art/commercial-agents.jpg",
  creative: "/art/creative-video.jpg",
  industry: "/art/commercial-services.jpg",
};
const byId = Object.fromEntries(customerProducts.map((product) => [product.id, product]));

function ProductLink({ product }) {
  if (!product) return null;
  return <a href={product.href || `/products/${product.id}`} className="group block border-t border-[#CFC5B8]/60 py-4 transition hover:border-[#9E774B]">
    <div className="flex items-start justify-between gap-4"><div><div className="text-[15px] font-semibold tracking-[-.025em] text-[#29251F]">{product.name}</div><div className="mt-1 max-w-xl text-[9px] leading-5 text-[#766F67]">{product.summary}</div></div><span className="shrink-0 pt-1 text-[8px] font-semibold text-[#8A633C]">Explore</span></div>
  </a>;
}
function ProductsHeroArt() {
  const panels = [
    { src: "/art/commercial-commerce.jpg", label: "RUN", note: "Customers · orders · service", position: "center" },
    { src: "/art/commercial-channels.jpg", label: "PEOPLE", note: "Teams · schedules · work", position: "center" },
    { src: "/art/commercial-enterprise.jpg", label: "MONEY", note: "Finance · control · reporting", position: "center" },
    { src: "/art/commercial-solutions.jpg", label: "STOCK", note: "Supply · inventory · production", position: "center" },
  ];
  return <div className="relative min-h-[580px] overflow-hidden border-t border-black/[0.06] bg-[#171614] lg:min-h-0 lg:border-l lg:border-t-0">
    <div className="absolute inset-0 grid grid-cols-[1.35fr_.65fr] gap-px bg-[#D6A66A]/28">
      <div className="relative overflow-hidden">
        <Image src={panels[0].src} alt="" fill priority sizes="(min-width: 1024px) 38vw, 100vw" className="object-cover" style={{objectPosition:panels[0].position}} />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,8,6,.04),rgba(10,8,6,.18)_52%,rgba(10,8,6,.80))]" />
        <div className="absolute bottom-7 left-7 right-7">
          <div className="text-[7px] font-semibold uppercase tracking-[.22em] text-[#E9C18A]">01 · {panels[0].label}</div>
          <div className="mt-2 text-[16px] font-medium tracking-[-.025em] text-white/90">{panels[0].note}</div>
        </div>
      </div>
      <div className="grid grid-rows-3 gap-px bg-[#D6A66A]/28">
        {panels.slice(1).map((panel,index)=><div key={panel.label} className="relative overflow-hidden">
          <Image src={panel.src} alt="" fill sizes="(min-width: 1024px) 18vw, 42vw" className="object-cover" style={{objectPosition:panel.position}} />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,8,6,.04),rgba(10,8,6,.64))]" />
          <div className="absolute bottom-5 left-5 right-4">
            <div className="text-[7px] font-semibold uppercase tracking-[.20em] text-[#E9C18A]">0{index+2} · {panel.label}</div>
            <div className="mt-1.5 text-[9px] leading-4 text-white/66">{panel.note}</div>
          </div>
        </div>)}
      </div>
    </div>
    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,7,5,.10),transparent_45%,rgba(9,7,5,.10))]" />
    <div className="absolute left-7 top-7 flex items-center gap-2 text-[7px] font-semibold uppercase tracking-[.24em] text-[#F1C98E]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#D6A66A] shadow-[0_0_14px_rgba(214,166,106,.8)]" />
      AVANTIQO / PRODUCTS
    </div>
    <div className="absolute bottom-7 left-[7%] right-[7%] hidden rounded-[22px] border border-white/15 bg-[#15120F]/78 px-5 py-4 text-white shadow-[0_24px_70px_rgba(0,0,0,.24)] backdrop-blur-xl sm:block">
      <div className="flex items-center justify-between gap-6">
        <div>
          <div className="text-[7px] font-semibold uppercase tracking-[.20em] text-[#D6A66A]">START ANYWHERE</div>
          <div className="mt-1.5 text-[13px] font-medium text-white/86">One business context. Add only what creates value.</div>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-1 text-[7px] uppercase tracking-[.13em] text-white/45">
          <span>Documents</span><span>Intelligence</span><span>Creative</span><span>Industry systems</span>
        </div>
      </div>
    </div>
  </div>;
}


export default function ProductsCatalogPage(){
  return <main className="min-h-screen bg-[#F7F6F3] text-[#171614]">
    <PublicSiteHeader context="Products" audience="business" />
    <section className="relative overflow-hidden border-b border-[#CFC5B8]/55 bg-[#F3EEE5]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(214,166,106,.22),transparent_34%)]" />
      <div className="relative mx-auto max-w-[1540px] lg:grid lg:min-h-[720px] lg:grid-cols-[43%_57%]">
        <div className="relative z-10 flex items-center px-5 py-16 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
          <div className="max-w-[640px]">
            <p className="text-[9px] font-semibold uppercase tracking-[.24em] text-[#9A744B]">AVANTIQO PRODUCTS</p>
            <h1 className="mt-5 text-[52px] font-medium leading-[.93] tracking-[-.065em] sm:text-[66px] xl:text-[78px]">Start with what your business needs now.</h1>
            <p className="mt-7 max-w-[590px] text-[16px] leading-8 text-[#625D55]">Choose a focused product, solve one part of the business, and add more when it makes sense. Avantiqo grows with you without forcing a complete system change on day one.</p>
            <div className="mt-9 flex flex-wrap gap-2.5">
              <a href="#run-business" className="inline-flex h-11 items-center rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white shadow-[0_9px_28px_rgba(20,18,15,.16)] transition hover:-translate-y-0.5">Choose by business need</a>
              <a href="#all-products" className="inline-flex h-11 items-center rounded-full border border-black/[0.10] bg-white/64 px-5 text-[10px] font-semibold text-[#5C554D] transition hover:border-[#D6A66A]/45">See all products</a>
            </div>
            <div className="mt-10 grid max-w-[560px] grid-cols-3 border-t border-black/[0.08] pt-5">
              {["Start focused","Stay connected","Expand when useful"].map((item,index)=><div key={item} className={index?"border-l border-black/[0.07] pl-4":"pr-4"}><div className="text-[7px] font-semibold uppercase tracking-[.15em] text-[#9A744B]">0{index+1}</div><div className="mt-2 text-[9px] leading-4 text-[#716A62]">{item}</div></div>)}
            </div>
          </div>
        </div>
        <ProductsHeroArt />
      </div>
    </section>
    <section className="border-b border-[#CFC5B8]/45 bg-[#FBFAF8]"><div className="mx-auto max-w-[1540px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
      <div className="grid gap-6 lg:grid-cols-[.65fr_1.35fr] lg:items-end"><div><p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#9A744B]">CHOOSE BY BUSINESS NEED</p><h2 className="mt-3 text-[40px] font-medium leading-[1] tracking-[-.05em] sm:text-[54px]">Where do you want to improve first?</h2></div><p className="max-w-2xl text-[12px] leading-6 text-[#6E675F] lg:justify-self-end">Choose the business problem you want to solve. Avantiqo shows the products that help you do it.</p></div>
      <div className="mt-10 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{CUSTOMER_GROUPS.map((group,index)=><a key={group.id} href={`#${group.id}`} className="group overflow-hidden rounded-[22px] border border-black/[0.07] bg-white shadow-[0_12px_34px_rgba(42,32,22,.04)] transition hover:-translate-y-0.5 hover:border-[#C59A66]/50">
        <div className="relative h-[150px] overflow-hidden bg-[#171614]"><Image src={GROUP_ART[group.id]} alt="" fill sizes="(min-width:1280px) 25vw, (min-width:768px) 50vw, 100vw" className="object-cover transition duration-700 group-hover:scale-[1.025]" /><div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,8,6,.03),rgba(10,8,6,.62))]" /><div className="absolute bottom-4 left-4 text-[7px] font-semibold uppercase tracking-[.18em] text-[#F0C98F]">0{index+1} · {group.label}</div></div>
        <div className="p-5"><h3 className="text-[21px] font-medium leading-[1.05] tracking-[-.04em] text-[#29251F]">{group.headline}</h3><p className="mt-3 text-[10px] leading-5 text-[#756E66]">{group.description}</p><div className="mt-5 text-[8px] font-semibold text-[#815B36]">Explore this area →</div></div>
      </a>)}</div>
    </div></section>

    <section className="border-b border-[#CFC5B8]/45 bg-[#171614] text-white"><div className="mx-auto grid max-w-[1540px] gap-8 px-5 py-10 sm:px-7 lg:grid-cols-[.75fr_1.25fr] lg:px-10 xl:px-14"><div><p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#D6A66A]">BUILT AROUND YOUR BUSINESS</p><h2 className="mt-3 text-[30px] font-medium tracking-[-.04em]">Start focused. Expand when you are ready.</h2></div><p className="max-w-3xl text-[12px] leading-6 text-white/58">A restaurant can start with POS. A hotel can start with front desk. An employer can start with Workforce. A finance team can start with invoicing. Add the rest only when it creates value.</p></div></section>

    <section className="border-b border-[#CFC5B8]/45 bg-[#171614] text-white"><div className="mx-auto max-w-[1540px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
      <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end"><div><p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#D6A66A]">HOW AVANTIQO CONNECTS THE WORK</p><h2 className="mt-3 text-[36px] font-medium leading-[1.02] tracking-[-.05em] sm:text-[50px]">One action can move the whole business forward.</h2></div><p className="max-w-2xl text-[12px] leading-6 text-white/50 lg:justify-self-end">The value is not another collection of modules. It is the connection between the work people already do.</p></div>
      <div className="mt-10 grid gap-3 lg:grid-cols-2">
        {[["A sale happens",["POS sale","Stock changes","Revenue posts","Payment reconciles","Business Partner understands it"]],["A person starts work",["Clock in","Schedule updates","Hours accumulate","Payroll uses the record","Finance receives the result"]]].map(([title,steps])=><div key={title} className="rounded-[24px] border border-white/[0.08] bg-white/[0.025] p-6"><div className="text-[9px] font-semibold text-white/82">{title}</div><div className="mt-6 grid gap-2 sm:grid-cols-5">{steps.map((step,index)=><div key={step} className="relative rounded-[14px] border border-white/[0.07] bg-black/15 px-3 py-4"><div className="text-[7px] font-semibold text-[#D6A66A]">0{index+1}</div><div className="mt-2 text-[8px] leading-4 text-white/58">{step}</div>{index<steps.length-1?<span className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-[10px] text-[#D6A66A]/50 sm:block">→</span>:null}</div>)}</div></div>)}
      </div>
    </div></section>

    <section className="border-b border-[#CFC5B8]/45 bg-[#EEE8DE]"><div className="mx-auto grid max-w-[1540px] gap-10 px-5 py-16 sm:px-7 lg:grid-cols-[.85fr_1.15fr] lg:items-center lg:px-10 lg:py-20 xl:px-14">
      <div><p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#9A744B]">BUSINESS PARTNER</p><h2 className="mt-3 text-[38px] font-medium leading-[1.02] tracking-[-.05em] sm:text-[52px]">Ask Avantiqo about your business.</h2><p className="mt-5 max-w-xl text-[12px] leading-6 text-[#6D665E]">Instead of searching through screens, ask a direct business question. Avantiqo can use the connected records and take you to the work that needs attention.</p><a href="/intelligence-platform" className="mt-7 inline-flex h-11 items-center rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white">Explore Business Partner →</a></div>
      <div className="rounded-[26px] border border-black/[0.08] bg-[#171614] p-4 shadow-[0_28px_80px_rgba(35,27,20,.16)] sm:p-5"><div className="rounded-[20px] border border-white/[0.08] bg-[#201D19] p-5 text-white">
        <div className="text-[7px] font-semibold uppercase tracking-[.2em] text-[#D6A66A]">ASK THE BUSINESS</div>
        <div className="mt-4 space-y-2">{["Why did food cost increase this week?","Which invoices are overdue?","Who has not arrived for their shift?","What should I order tomorrow?","Create the invoice and send it."].map((q,index)=><div key={q} className="flex items-center justify-between rounded-[13px] border border-white/[0.07] bg-white/[0.025] px-4 py-3"><span className="text-[9px] text-white/62">{q}</span><span className="text-[8px] text-[#D6A66A]">0{index+1}</span></div>)}</div>
      </div></div>
    </div></section>

    {CUSTOMER_GROUPS.map((group,index)=>{
      const featured=(CUSTOMER_FEATURES[group.id]||[]).map((id)=>byId[id]).filter(Boolean);
      return <section key={group.id} id={group.id} className={`scroll-mt-24 border-b border-[#CFC5B8]/45 ${index%2===0?'bg-[#F3EFE7]':'bg-[#FBFAF8]'}`}><div className="mx-auto max-w-[1540px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
        <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-stretch">
          <div className={`relative min-h-[300px] overflow-hidden rounded-[26px] bg-[#171614] shadow-[0_20px_55px_rgba(45,32,20,.10)] ${index%2===1?'lg:order-2':''}`}>
            <Image src={GROUP_ART[group.id]} alt="" fill sizes="(min-width:1024px) 34vw, 100vw" className="object-cover" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,8,6,.05),rgba(10,8,6,.18)_46%,rgba(10,8,6,.78))]" />
            <div className="absolute left-6 top-6 text-[7px] font-semibold uppercase tracking-[.2em] text-[#F0C98F]">AVANTIQO / {group.label}</div>
            <div className="absolute bottom-6 left-6 right-6">
              <div className="text-[8px] font-semibold uppercase tracking-[.17em] text-[#D6A66A]">{String(index+1).padStart(2,'0')}</div>
              <div className="mt-2 max-w-md text-[24px] font-medium leading-[1.05] tracking-[-.035em] text-white/92">{group.headline}</div>
            </div>
          </div>
          <div className={`flex flex-col justify-center ${index%2===1?'lg:order-1':''}`}>
            <p className="max-w-2xl text-[13px] leading-7 text-[#6E675F]">{group.description}</p>
            <div className="mt-7 grid gap-x-8 md:grid-cols-2 xl:grid-cols-3">{featured.map((product)=><ProductLink key={product.id} product={product}/>)}</div>
          </div>
        </div>
      </div></section>;
    })}
    <ProductFinder products={customerProducts} groups={CUSTOMER_GROUPS} />

    <section className="border-b border-[#CFC5B8]/45 bg-[#F3EEE5]"><div className="mx-auto grid max-w-[1320px] gap-8 px-5 py-16 sm:px-7 lg:grid-cols-[1fr_auto] lg:items-center lg:px-10"><div><p className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#9A744B]">BUILDING WITH AVANTIQO?</p><h2 className="mt-3 text-[34px] font-medium tracking-[-.045em]">APIs, integrations and platform tools live in Developers.</h2><p className="mt-3 max-w-3xl text-[11px] leading-6 text-[#6F685F]">Business teams can stay focused on products and outcomes, while developers get a separate area for APIs, integrations and technical tools.</p></div><a href="/developers" className="text-[10px] font-semibold text-[#815B36]">Explore Developers</a></div></section>

    <section className="bg-[#171614] text-white"><div className="mx-auto grid max-w-[1320px] gap-8 px-5 py-20 sm:px-7 lg:grid-cols-[1fr_auto] lg:items-center lg:px-10 lg:py-24"><div><p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#D6A66A]">BUILD YOUR AVANTIQO</p><h2 className="mt-4 max-w-4xl text-[44px] font-medium leading-[.98] tracking-[-.055em] sm:text-[60px]">Start with what matters now. Expand from there.</h2><p className="mt-5 max-w-3xl text-[13px] leading-7 text-white/50">Choose the product that solves today's problem. Add connected products when they create the next piece of value.</p></div><div><a href="/start" className="inline-flex h-11 items-center rounded-full bg-[#D6A66A] px-5 text-[10px] font-semibold text-[#3F3327]">Talk to Avantiqo</a></div></div></section>
  </main>;
}
