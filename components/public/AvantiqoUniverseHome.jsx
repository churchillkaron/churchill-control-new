import Image from "next/image";
import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import BusinessPartnerShowcase from "@/components/public/BusinessPartnerShowcase";

const PRIMARY_AREAS = [
  {
    eyebrow: "01 · RUN THE BUSINESS",
    title: "Operate the business from one connected system.",
    copy: "Customers, sales, reservations, work, people, finance, stock and documents stay connected instead of living in separate software.",
    href: "/products",
    image: "/art/generated/products/products-hero-v1.png",
  },
  {
    eyebrow: "02 · INTELLIGENCE",
    title: "Ask, decide and get approved work done.",
    copy: "Business Partner and specialist agents read live business evidence, reason across context, execute approved capabilities and verify the outcome.",
    href: "/intelligence-platform",
    art: "business-partner",
  },
  {
    eyebrow: "03 · COMMUNICATIONS & REPUTATION",
    title: "Every customer conversation in one place.",
    copy: "WhatsApp, LINE, Messenger, Instagram, email, social channels and reviews can share the same customer history, routing and approval flow.",
    href: "/products#communications-reputation",
    image: "/art/generated/products/communications-reputation-approved.png",
  },
  {
    eyebrow: "04 · CREATE & GROW",
    title: "Create, publish and grow from the same platform.",
    copy: "Campaigns, image, video, music, voice, websites and commerce connect back to the same business context and customer journey.",
    href: "/creative-studios",
    image: "/art/generated/products/products-creative-v2.png",
  },
];

function Arrow(){return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
function HeroIcon({ type }) {
  const common = { fill:"none", stroke:"currentColor", strokeWidth:"1.35", strokeLinecap:"round", strokeLinejoin:"round" };
  if (type === "products") return <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true"><path {...common} d="M6 25V17M12 25V12M18 25V8M24 25V4"/></svg>;
  if (type === "people") return <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true"><circle {...common} cx="16" cy="10" r="4"/><circle {...common} cx="7.5" cy="13" r="2.5"/><circle {...common} cx="24.5" cy="13" r="2.5"/><path {...common} d="M9 25v-2.3c0-3.9 3.1-7 7-7s7 3.1 7 7V25M2.5 25v-1.6c0-2.9 2.2-5.3 5-5.6M29.5 25v-1.6c0-2.9-2.2-5.3-5-5.6"/></svg>;
  if (type === "intelligence") return <svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden="true"><circle {...common} cx="16" cy="16" r="6"/><circle {...common} cx="16" cy="4" r="2"/><circle {...common} cx="27" cy="10" r="2"/><circle {...common} cx="27" cy="22" r="2"/><circle {...common} cx="16" cy="28" r="2"/><circle {...common} cx="5" cy="22" r="2"/><circle {...common} cx="5" cy="10" r="2"/><path {...common} d="M16 6v4M21 13l4-2M21 19l4 2M16 22v4M11 19l-4 2M11 13l-4-2"/></svg>;
  if (type === "creative") return <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true"><path {...common} d="m7 24 3-8L21.8 4.2a2.8 2.8 0 0 1 4 4L14 20l-7 4Z"/><path {...common} d="m10 16 6 6M21 8l3 3M18 26h8"/></svg>;
  if (type === "developers") return <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true"><path {...common} d="m11 8-7 8 7 8M21 8l7 8-7 8M18 5l-4 22"/></svg>;
  return <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true"><path {...common} d="M9.5 24h14a5.5 5.5 0 0 0 .9-10.9A8.5 8.5 0 0 0 8.1 11 6.5 6.5 0 0 0 9.5 24Z"/></svg>;
}

export default function AvantiqoUniverseHome(){
  return (
    <main className="min-h-screen bg-[#F7F6F3] text-[#171614]">
    <PublicSiteHeader context="Avantiqo" audience="platform" tone="light" />
    <section className="relative isolate overflow-hidden border-b border-[#D6A66A]/22 bg-[#F4EDE2] text-[#171614]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,.94),transparent_30%),radial-gradient(circle_at_73%_34%,rgba(255,244,226,.88),transparent_26%),linear-gradient(180deg,#F5EFE7_0%,#EFE5D7_52%,#E8DDCE_100%)]"/>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[48%] opacity-80 [background-image:radial-gradient(circle_at_50%_100%,rgba(255,255,255,.98),transparent_48%),linear-gradient(180deg,rgba(255,255,255,.68),transparent)]"/>
      <div className="pointer-events-none absolute -right-[13vw] -top-[31vw] hidden h-[72vw] w-[72vw] rounded-full border border-[#C9A26F]/22 bg-[radial-gradient(circle_at_30%_70%,rgba(255,252,246,.98),rgba(229,216,197,.88)_25%,rgba(178,157,131,.48)_49%,rgba(113,99,83,.24)_64%,rgba(255,255,255,.08)_73%)] shadow-[-32px_38px_100px_rgba(192,146,86,.18),inset_24px_-38px_92px_rgba(125,103,79,.14)] lg:block"/>
      <div className="pointer-events-none absolute right-[2vw] top-[3vw] hidden h-[55vw] w-[55vw] rounded-full border border-[#D6A66A]/16 opacity-80 lg:block"/>
      <div className="pointer-events-none absolute right-[4vw] top-[10vw] hidden h-[28vw] w-[70vw] rotate-[-11deg] rounded-[50%] border border-[#C99859]/48 shadow-[0_0_22px_rgba(214,166,106,.16)] lg:block"/>
      <div className="pointer-events-none absolute right-[-6vw] top-[16vw] hidden h-[20vw] w-[63vw] rotate-[7deg] rounded-[50%] border border-[#C99859]/28 lg:block"/>
      <div className="pointer-events-none absolute bottom-[22%] left-[-10%] h-[17%] w-[120%] rounded-[50%] bg-white/45 blur-2xl"/>
      <div className="pointer-events-none absolute bottom-[10%] left-[-8%] h-px w-[116%] rotate-[2deg] bg-[linear-gradient(90deg,transparent,rgba(190,140,79,.78)_36%,rgba(214,166,106,.28)_72%,transparent)] shadow-[0_0_18px_rgba(214,166,106,.32)]"/>
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[30%] bg-[radial-gradient(ellipse_at_66%_100%,rgba(255,255,255,.78),transparent_56%)]"/>

      <div className="relative mx-auto max-w-[1680px] px-5 pb-10 pt-16 sm:px-7 lg:min-h-[760px] lg:px-10 lg:pb-12 lg:pt-20 xl:px-16">
        <div className="relative z-20 max-w-[790px] lg:pt-8">
          <div className="text-[44px] font-light uppercase tracking-[.31em] text-[#A77438] sm:text-[56px] lg:text-[66px]">AVANTIQO</div>
          <div className="mt-3 text-[9px] font-medium uppercase tracking-[.48em] text-[#282522]/82 sm:text-[11px]">Intelligent Operating Platform</div>
          <h1 className="mt-10 max-w-[900px] text-[42px] font-light leading-[.98] tracking-[-0.045em] text-[#151515] sm:text-[58px] lg:text-[64px]">Run the business. <span className="text-[#A66F2F]">Create the next thing.</span></h1>
          <p className="mt-4 text-[20px] font-light tracking-[-0.02em] text-[#7E766D] sm:text-[24px]">One business. One context.</p>
          <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3 text-[8px] font-medium uppercase tracking-[.28em] text-[#2B2825]/74 sm:gap-x-7 sm:text-[9px]">
            {['RUN','THINK','CREATE','BUILD','SCALE'].map((item,index)=><span key={item} className="flex items-center gap-5 sm:gap-7">{index>0?<span className="h-1 w-1 rounded-full bg-[#B47C3A]"/>:null}{item}</span>)}
          </div>
        </div>

        <div className="relative z-20 mt-16 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:absolute lg:bottom-[15%] lg:right-[4%] lg:mt-0 lg:flex lg:items-end lg:gap-3 xl:right-[5%]">
          {[
            ['Products','/products','products','lg:h-[170px] lg:w-[106px]'],
            ['Customer Experience','/products','people','lg:h-[200px] lg:w-[128px]'],
            ['Intelligence','/intelligence-platform','intelligence','lg:h-[258px] lg:w-[160px]'],
            ['Creative Production','/creative-studios','creative','lg:h-[220px] lg:w-[142px]'],
            ['Developers','/developers','developers','lg:h-[188px] lg:w-[130px]'],
            ['Compute','/compute','compute','lg:h-[166px] lg:w-[112px]'],
          ].map(([label,href,icon,size],index)=><a key={label} href={href} className={`group relative flex min-h-[138px] flex-col items-center justify-center overflow-hidden rounded-[20px] border bg-[linear-gradient(155deg,rgba(255,255,255,.72),rgba(255,252,247,.34))] px-3 text-center shadow-[0_18px_44px_rgba(125,95,58,.08)] backdrop-blur-[10px] transition duration-500 hover:-translate-y-2 hover:border-[#C99859]/62 hover:bg-white/80 ${index===2?'border-[#C99859]/74 shadow-[0_22px_64px_rgba(180,124,58,.16),inset_0_0_34px_rgba(255,255,255,.32)]':'border-white/90'} ${size}`}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(214,166,106,.13),transparent_58%)] opacity-0 transition group-hover:opacity-100"/>
            <div className="relative text-[#9A6628]"><HeroIcon type={icon}/></div>
            <div className="relative mt-5 text-[7px] font-semibold uppercase leading-4 tracking-[.18em] text-[#29251F]/76 lg:text-[8px]">{label}</div>
            <div className="absolute bottom-0 left-[18%] right-[18%] h-px bg-[linear-gradient(90deg,transparent,rgba(185,127,60,.82),transparent)] opacity-0 transition group-hover:opacity-100"/>
          </a>)}
        </div>

        <div className="relative z-20 mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-[#8E6B43]/12 pt-5 lg:absolute lg:bottom-6 lg:left-10 lg:right-10 lg:mt-0 xl:left-16 xl:right-16">
          <div className="text-[7px] uppercase tracking-[.24em] text-[#27231E]/42">Ideas · People · Products · A stronger tomorrow</div>
          <a href="/start" className="inline-flex items-center gap-3 text-[8px] font-medium uppercase tracking-[.23em] text-[#40372E]/62 transition hover:text-[#9A6628]"><span className="h-px w-8 bg-[#B47C3A]"/>A more capable tomorrow</a>
        </div>
      </div>
      </section>

    <section className="border-y border-black/[0.06] bg-[#EEE6DB] text-[#1D1B18]"><div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
      <div className="grid gap-8 lg:grid-cols-[.7fr_1.3fr] lg:items-end"><div><p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#B97B36]">ONE BUSINESS · CONNECTED WORK</p><h2 className="mt-3 text-[38px] font-medium leading-[1.02] tracking-[-0.05em] sm:text-[52px]">The handoffs are where Avantiqo becomes different.</h2></div><p className="max-w-2xl text-[12px] leading-6 text-[#6E655C] lg:justify-self-end">A sale can change stock, finance and customer history. A clock-in can affect scheduling, payroll and finance. The same business context stays attached instead of being re-entered across separate software.</p></div>
      <div className="mt-10 grid gap-2 md:grid-cols-7">{["Customers","Sales","Operations","People","Stock","Finance","Intelligence"].map((item,index)=><div key={item} className="relative rounded-[16px] border border-black/[0.07] bg-white/52 px-4 py-5"><div className="text-[7px] font-semibold text-[#B97B36]">0{index+1}</div><div className="mt-3 text-[9px] text-[#5F554B]">{item}</div>{index<6?<span className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-[#B97B36]/50 md:block">→</span>:null}</div>)}</div>
      <div className="mt-10 grid gap-8 rounded-[28px] border border-black/[0.07] bg-white/52 p-6 lg:grid-cols-[.8fr_1.2fr] lg:p-8">
        <div><div className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#B97B36]">BUSINESS PARTNER</div><h3 className="mt-3 text-[30px] font-medium tracking-[-.045em]">Tell Avantiqo what you need done.</h3><p className="mt-4 text-[11px] leading-6 text-[#6E655C]">Business Partner can investigate, reason across the connected company context, prepare work, execute approved capabilities and verify what happened.</p><a href="/intelligence-platform" className="mt-6 inline-flex text-[9px] font-semibold text-[#8A633C]">Explore Business Partner →</a></div>
        <BusinessPartnerShowcase compact />
      </div>
    </div></section>

      <section className="border-b border-black/[0.06] bg-[#F8F5F0]">
        <div className="mx-auto grid max-w-[1540px] gap-8 px-5 py-16 sm:px-7 lg:grid-cols-[.72fr_1.28fr] lg:px-10 lg:py-22">
          <div className="max-w-lg self-center">
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">BUSINESS PARTNER</p>
            <h2 className="mt-3 text-[42px] font-medium leading-[.98] tracking-[-0.055em] sm:text-[58px]">Tell Avantiqo what you need done.</h2>
            <p className="mt-5 text-[13px] leading-7 text-[#706A62]">Business Partner is the conversational operator for the platform. It can investigate, reason across connected evidence, prepare work, execute approved capabilities and verify the result.</p>
            <a href="/intelligence-platform" className="mt-7 inline-flex h-11 items-center gap-2 rounded-full border border-black/[0.10] bg-white/72 px-5 text-[10px] font-semibold text-[#56514A]">Explore Intelligence <Arrow /></a>
          </div>
          <BusinessPartnerShowcase compact />
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#FBFAF8]">
        <div className="mx-auto max-w-[1540px] px-5 py-16 sm:px-7 lg:px-10 lg:py-24">
          <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">BUILT FOR REAL INDUSTRIES</p>
              <h2 className="mt-3 max-w-2xl text-[42px] font-medium leading-[.98] tracking-[-0.055em] sm:text-[58px]">Start from the way your business already works.</h2>
            </div>
            <p className="max-w-2xl text-[13px] leading-7 text-[#706A62] lg:justify-self-end">Industry solutions bring together the relevant operations, finance, people, stock, customer and intelligence capabilities without forcing every company into the same workflow.</p>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {INDUSTRIES.map(([name,href,image])=><a key={name} href={href} className="group relative min-h-[270px] overflow-hidden rounded-[26px] border border-black/[0.07] bg-[#E9DFD1] shadow-[0_16px_45px_rgba(35,26,18,.05)]"><Image src={image} alt="" fill sizes="33vw" className="object-cover transition duration-700 group-hover:scale-[1.025]"/><div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,8,5,.01),rgba(12,8,5,.09)_52%,rgba(12,8,5,.62))]"/><div className="absolute inset-x-5 bottom-5 flex items-center justify-between gap-3"><div><div className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#F0C98F]">AVANTIQO / SOLUTION</div><div className="mt-2 text-[24px] font-medium tracking-[-.045em] text-white">{name}</div></div><span className="text-white"><Arrow/></span></div></a>)}
          </div>
          <div className="mt-7 text-center"><a href="/solutions" className="inline-flex h-11 items-center gap-2 rounded-full border border-[#D6A66A]/38 bg-white/72 px-5 text-[10px] font-semibold text-[#6A5540]">Explore all solutions <Arrow /></a></div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#F2ECE3]">
        <div className="mx-auto max-w-[1540px] px-5 py-16 sm:px-7 lg:px-10 lg:py-22">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["CREATIVE STUDIOS","Create world-class image, video, music, voice and audio production.","/creative-studios","/art/generated/creative-hero-v3.png"],
              ["DEVELOPERS","Build integrations, applications and embedded experiences on Avantiqo capabilities.","/developers","/art/generated/developers/developer-integration-v1.png"],
              ["COMPUTE","Run inference, rendering and specialist workloads with owned capacity first.","/compute","/art/generated/developers/developer-runtime-v1.png"],
            ].map(([title,copy,href,image])=><a key={title} href={href} className="group overflow-hidden rounded-[26px] border border-black/[0.07] bg-white/72 shadow-[0_14px_40px_rgba(40,30,20,.04)]"><div className="relative h-[210px] overflow-hidden"><Image src={image} alt="" fill sizes="33vw" className="object-cover transition duration-700 group-hover:scale-[1.025]"/><div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,6,4,.01),rgba(8,6,4,.42))]"/><div className="absolute left-5 top-5 text-[7px] font-semibold uppercase tracking-[.18em] text-[#F1C98E]">{title}</div></div><div className="p-6"><p className="text-[14px] leading-6 text-[#5F5951]">{copy}</p><div className="mt-5 text-[9px] font-semibold text-[#865F39]">Explore →</div></div></a>)}
          </div>
        </div>
      </section>

      <section className="bg-[#F3EFE7]">
        <div className="mx-auto max-w-[1120px] px-5 py-20 text-center sm:px-7 lg:px-10 lg:py-28">
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">START WITH THE PROBLEM YOU WANT SOLVED</p>
          <h2 className="mx-auto mt-4 max-w-4xl text-[42px] font-medium leading-[1.00] tracking-[-0.055em] sm:text-[60px]">One business. One context. More ways to get work done.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-[13px] leading-7 text-[#706A62]">Choose the first outcome you need today. Avantiqo can expand with the business without making you rebuild the context every time.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-2.5"><a href="/start" className="inline-flex h-11 items-center rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white">Start with Avantiqo →</a><a href="/products" className="inline-flex h-11 items-center rounded-full border border-[#D6A66A]/40 bg-white/72 px-5 text-[10px] font-semibold text-[#6A5540]">Explore products</a></div>
        </div>
      </section>
    </main>
  );
}
