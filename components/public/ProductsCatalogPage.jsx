import Image from "next/image";
import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import ProductFinder from "@/components/public/ProductControlIndex";
import { productCatalog } from "@/components/public/productCatalog";
import { CUSTOMER_GROUPS, CUSTOMER_FEATURES, isCustomerProduct } from "@/components/public/customerProductGroups";

const customerProducts = productCatalog.filter(isCustomerProduct);
const GROUP_ART = {
  "run-business": "/art/avantiqo-luxury/hospitality-hero.webp",
  people: "/art/avantiqo-luxury/hospitality-hero.webp",
  finance: "/art/commercial-insights.jpg",
  stock: "/churchill/bar.JPG",
  documents: "/art/commercial-integrations.jpg",
  intelligence: "/art/commercial-insights.jpg",
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
function CategoryArt({group,index,compact=false}) {
  const photo = GROUP_ART[group.id];
  if (group.id === "people") return <div className="absolute inset-0 overflow-hidden bg-[#11100E] text-white">
    <Image src="/art/avantiqo-luxury/hospitality-hero.webp" alt="" fill sizes={compact?"25vw":"40vw"} className="object-cover opacity-20"/>
    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,8,6,.94),rgba(10,8,6,.70),rgba(10,8,6,.88))]"/>
    <div className="absolute inset-x-[9%] top-[13%] grid grid-cols-2 gap-2">{[["08:00","KITCHEN","READY"],["15:00","SERVICE","12 STAFF"],["17:00","BAR","4 STAFF"],["14:00","MANAGER","ON DUTY"]].map(([t,a,b])=><div key={a} className="rounded-[12px] border border-white/[.08] bg-white/[.025] p-3"><div className="text-[6px] text-[#D6A66A]">{t}</div><div className="mt-2 text-[8px] tracking-[.12em] text-white/60">{a}</div><div className="mt-1 text-[6px] text-white/28">{b}</div></div>)}</div>
    <div className="absolute bottom-4 left-4 text-[7px] font-semibold uppercase tracking-[.18em] text-[#F0C98F]">0{index+1} · {group.label}</div>
  </div>;
  if (group.id === "finance") return <div className="absolute inset-0 overflow-hidden bg-[#12100E] text-white"><div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(214,166,106,.18),transparent_32%)]"/><div className="absolute inset-x-[12%] top-[16%] space-y-3">{[["CASH","+6.4%"],["REVENUE","THB"],["PAYABLES","12"],["CLOSE","READY"]].map(([a,b],i)=><div key={a} className="flex items-center justify-between border-b border-white/[.09] pb-2"><span className="text-[7px] tracking-[.16em] text-white/42">{a}</span><span className="text-[9px] text-[#D6A66A]">{b}</span></div>)}</div><div className="absolute bottom-4 left-4 text-[7px] font-semibold uppercase tracking-[.18em] text-[#F0C98F]">0{index+1} · {group.label}</div></div>;
  if (group.id === "stock") return <div className="absolute inset-0 overflow-hidden bg-[#17130F] text-white">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(214,166,106,.18),transparent_32%)]" />
    <div className="absolute left-[9%] right-[9%] top-[16%] grid grid-cols-3 gap-2">
      {[["OLIVE OIL","12.4 L","68%"],["BEEF","18.2 KG","41%"],["WINE","36 BT","77%"],["HERBS","4.8 KG","54%"],["SEAFOOD","8.1 KG","31%"],["DRY GOODS","24 UN","83%"]].map(([a,b,w])=><div key={a} className="rounded-[12px] border border-white/[.08] bg-white/[.025] p-3"><div className="text-[6px] tracking-[.14em] text-white/34">{a}</div><div className="mt-2 text-[10px] text-white/76">{b}</div><div className="mt-2 h-[2px] bg-white/[.07]"><div className="h-full bg-[#D6A66A]/70" style={{width:w}} /></div></div>)}
    </div>
    <div className="absolute bottom-4 left-4 text-[7px] font-semibold uppercase tracking-[.18em] text-[#F0C98F]">0{index+1} · {group.label}</div>
  </div>;
  if (group.id === "industry") return <div className="absolute inset-0 overflow-hidden bg-[#12100E]">
    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px bg-[#D6A66A]/20">
      {[["RESTAURANT","/art/avantiqo-luxury/hospitality-hero.webp"],["HOTEL","/art/commercial-enterprise.jpg"],["RETAIL","/art/commercial-commerce.jpg"],["SERVICES","/art/commercial-services.jpg"]].map(([a,img])=><div key={a} className="relative overflow-hidden"><Image src={img} alt="" fill sizes="20vw" className="object-cover"/><div className="absolute inset-0 bg-black/32"/><div className="absolute bottom-2 left-2 text-[6px] tracking-[.14em] text-[#F0C98F]">{a}</div></div>)}
    </div>
    <div className="absolute bottom-4 left-4 text-[7px] font-semibold uppercase tracking-[.18em] text-[#F0C98F]">0{index+1} · {group.label}</div>
  </div>;
  if (group.id === "documents") return <div className="absolute inset-0 overflow-hidden bg-[#EDE5D9]"><div className="absolute left-[12%] top-[10%] h-[72%] w-[52%] rotate-[-4deg] rounded-lg border border-black/[.07] bg-[#FCFAF6] shadow-[0_18px_35px_rgba(40,30,20,.15)]"><div className="m-4 h-[3px] w-[42%] bg-[#A37849]/50"/><div className="mx-4 mt-6 space-y-3">{[72,89,54,80].map((w,i)=><div key={i} className="h-[2px] bg-black/[.09]" style={{width:`${w}%`}}/>)}</div></div><div className="absolute right-[11%] top-[23%] h-[58%] w-[43%] rotate-[3deg] rounded-lg border border-[#D6A66A]/28 bg-[#171614] p-4 shadow-[0_20px_40px_rgba(0,0,0,.22)]"><div className="text-[6px] font-semibold tracking-[.16em] text-[#D6A66A]">DOCUMENT → WORK</div><div className="mt-5 space-y-2">{["READ","CHECK","ROUTE","ACT"].map(x=><div key={x} className="border-b border-white/[.08] pb-1 text-[6px] text-white/50">{x}</div>)}</div></div><div className="absolute bottom-4 left-4 text-[7px] font-semibold uppercase tracking-[.18em] text-[#7D5936]">0{index+1} · {group.label}</div></div>;
  if (group.id === "intelligence") return <div className="absolute inset-0 overflow-hidden bg-[#0F0D0B]"><div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(214,166,106,.20),transparent_35%)]"/><svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 180"><path d="M45 90 C100 20 150 20 200 90 S300 160 355 90" fill="none" stroke="rgba(214,166,106,.40)"/><circle cx="45" cy="90" r="5" fill="#D6A66A"/><circle cx="200" cy="90" r="7" fill="#D6A66A"/><circle cx="355" cy="90" r="5" fill="#D6A66A"/></svg><div className="absolute left-[38%] top-[40%] text-[7px] font-semibold tracking-[.18em] text-white/70">BUSINESS PARTNER</div><div className="absolute bottom-4 left-4 text-[7px] font-semibold uppercase tracking-[.18em] text-[#F0C98F]">0{index+1} · {group.label}</div></div>;
  return <div className="absolute inset-0 overflow-hidden bg-[#171614]"><Image src={photo} alt="" fill sizes={compact?"25vw":"40vw"} className="object-cover transition duration-700 group-hover:scale-[1.025]" /><div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,8,6,.04),rgba(10,8,6,.66))]"/><div className="absolute bottom-4 left-4 text-[7px] font-semibold uppercase tracking-[.18em] text-[#F0C98F]">0{index+1} · {group.label}</div></div>;
}

function ProductsHeroArt() {
  const main={id:"run-business",label:"RUN THE BUSINESS"};
  const people={id:"people",label:"PEOPLE & WORK"};
  const finance={id:"finance",label:"FINANCE & CONTROL"};
  const stock={id:"stock",label:"STOCK & SUPPLY"};
  return <div className="relative min-h-[580px] overflow-hidden border-t border-black/[0.06] bg-[#171614] lg:min-h-0 lg:border-l lg:border-t-0">
    <div className="absolute inset-0 grid grid-cols-[1.32fr_.68fr] gap-px bg-[#D6A66A]/28">
      <div className="relative overflow-hidden"><CategoryArt group={main} index={0}/><div className="absolute bottom-7 left-7 right-7 rounded-[22px] border border-white/14 bg-[#15120F]/72 p-5 text-white shadow-[0_26px_70px_rgba(0,0,0,.24)] backdrop-blur-xl"><div className="text-[7px] font-semibold uppercase tracking-[.20em] text-[#D6A66A]">REAL BUSINESS · ONE CONTEXT</div><div className="mt-2 max-w-md text-[15px] leading-6 text-white/86">Customers, people, money, stock and intelligence moving together.</div></div></div>
      <div className="grid grid-rows-3 gap-px bg-[#D6A66A]/28"><div className="relative"><CategoryArt group={people} index={1} compact/></div><div className="relative"><CategoryArt group={finance} index={2} compact/></div><div className="relative"><CategoryArt group={stock} index={3} compact/></div></div>
    </div>
    <div className="absolute left-7 top-7 flex items-center gap-2 text-[7px] font-semibold uppercase tracking-[.24em] text-[#F1C98E]"><span className="h-1.5 w-1.5 rounded-full bg-[#D6A66A] shadow-[0_0_14px_rgba(214,166,106,.8)]"/>AVANTIQO / PRODUCTS</div>
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
        <div className="relative h-[165px] overflow-hidden bg-[#171614]"><CategoryArt group={group} index={index} compact /></div>
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
            <CategoryArt group={group} index={index} />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,8,6,.02),rgba(10,8,6,.12)_46%,rgba(10,8,6,.72))]" />
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
