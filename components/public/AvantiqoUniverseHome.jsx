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

const CONNECTED_AREAS = [
  {
    label: "Portals & external experience",
    title: "Customers, staff and suppliers get the right view of the same live business.",
    copy: "Bookings, payments, work, documents, messages, delivery status and history can move through role-aware portals without exposing the internal back office.",
    href: "/products#portals-external",
    image: "/art/generated/products/products-industry-v2.png",
  },
  {
    label: "Web & commerce",
    title: "Build the customer-facing business, not just the back office.",
    copy: "Websites, webshops, connected products, orders and inventory work with the same business data underneath.",
    href: "/products#web-commerce",
    image: "/art/commercial-commerce.jpg",
  },
  {
    label: "Markets",
    title: "Research, test and operate market decisions with evidence and control.",
    copy: "Live market evidence, specialist agents, portfolio risk and governed paper execution are connected to one decision record.",
    href: "/products#markets",
    image: "/art/generated/products/markets-approved.png",
  },
];

const INDUSTRIES = [
  ["Restaurant", "/solutions/restaurant", "/art/generated/solutions/verticals/solution-restaurant-v1.png"],
  ["Hotel", "/solutions/hotel", "/art/generated/solutions/verticals/solution-hotel-v1.png"],
  ["Field service", "/solutions/field-service", "/art/generated/solutions/verticals/solution-field-service-v1.png"],
  ["Pest control", "/solutions/pest-control", "/art/generated/solutions/verticals/solution-pest-control-v1.png"],
  ["Retail", "/solutions/retail", "/art/generated/solutions/verticals/solution-retail-v1.png"],
  ["Accounting", "/solutions/accounting", "/art/generated/solutions/verticals/solution-accounting-v1.png"],
];

function Arrow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
      <path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ImageCard({ item, tall = false }) {
  return (
    <a href={item.href} className="group overflow-hidden rounded-[28px] border border-black/[0.07] bg-[#F8F4EE] shadow-[0_18px_48px_rgba(45,34,22,.055)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_70px_rgba(45,34,22,.11)]">
      <div className={`relative overflow-hidden bg-[#E9DFD1] ${tall ? "h-[320px]" : "h-[235px]"}`}>
        {item.art === "business-partner" ? (
          <div className="absolute inset-3 overflow-hidden rounded-[22px]">
            <div className="origin-top-left scale-[.78] sm:scale-[.86] lg:scale-[.72] xl:scale-[.82]">
              <BusinessPartnerShowcase compact />
            </div>
          </div>
        ) : (
          <>
            <Image src={item.image} alt="" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover transition duration-700 group-hover:scale-[1.025]" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(18,13,9,.01),rgba(18,13,9,.05)_55%,rgba(18,13,9,.48))]" />
          </>
        )}
        <div className={`absolute bottom-5 left-5 rounded-full border px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[.18em] backdrop-blur-xl ${item.art === "business-partner" ? "border-black/[0.08] bg-[#F5E8D6]/85 text-[#8D6339]" : "border-white/25 bg-[#17120D]/50 text-[#F1C98E]"}`}>
          {item.eyebrow || item.label}
        </div>
      </div>
      <div className="p-6 sm:p-7">
        <h3 className="max-w-xl text-[28px] font-medium leading-[1.02] tracking-[-0.048em] text-[#29251F]">{item.title}</h3>
        <p className="mt-4 max-w-2xl text-[11px] leading-6 text-[#746E66]">{item.copy}</p>
        <div className="mt-6 inline-flex items-center gap-2 text-[9px] font-semibold text-[#865F39]">Explore <Arrow /></div>
      </div>
    </a>
  );
}

export default function AvantiqoUniverseHome() {
  return (
    <main className="min-h-screen bg-[#F7F6F3] text-[#171614]">
      <PublicSiteHeader context="Avantiqo" audience="platform" />

      <section className="relative overflow-hidden border-b border-black/[0.07] bg-[#F3EEE5]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_13%_0%,rgba(214,166,106,.18),transparent_34%)]" />
        <div className="relative mx-auto grid max-w-[1540px] gap-8 px-5 py-12 sm:px-7 lg:min-h-[760px] lg:grid-cols-[.84fr_1.16fr] lg:items-center lg:px-10 lg:py-16">
          <div className="max-w-[650px] xl:pl-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.28em] text-[#9A744B]">AVANTIQO / INTELLIGENT OPERATING PLATFORM</p>
            <h1 className="mt-5 text-[56px] font-medium leading-[.92] tracking-[-0.067em] sm:text-[72px] xl:text-[88px]">Run the business.<br />Create the next thing.</h1>
            <p className="mt-7 max-w-[610px] text-[16px] leading-8 text-[#625D55]">One connected platform for operating the business, serving customers, creating content, building digital experiences and using intelligence to move real work forward.</p>
            <p className="mt-4 max-w-[560px] text-[12px] leading-6 text-[#857C72]">Start with one problem. Keep the same business context as you add products, portals, communication channels, creative production, developers or compute later.</p>
            <div className="mt-9 flex flex-wrap gap-2.5">
              <a href="/start" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white shadow-[0_9px_28px_rgba(20,18,15,.16)]">Start Now <Arrow /></a>
              <a href="#what-avantiqo-does" className="inline-flex h-11 items-center rounded-full border border-black/[0.10] bg-white/70 px-5 text-[10px] font-semibold text-[#56514A]">See what Avantiqo does</a>
            </div>
            <div className="mt-10 grid max-w-[610px] grid-cols-2 gap-y-4 border-t border-black/[0.08] pt-5 sm:grid-cols-4">
              {["Business OS","Intelligence","Creative","Customer experience"].map((item,index)=><div key={item} className={index ? "border-l border-black/[0.07] pl-4" : "pr-4"}><div className="text-[7px] font-semibold uppercase tracking-[.15em] text-[#9A744B]">0{index+1}</div><div className="mt-2 text-[9px] leading-4 text-[#716A62]">{item}</div></div>)}
            </div>
          </div>

          <div className="relative min-h-[560px] overflow-hidden rounded-[36px] border border-black/[0.08] bg-[#E9DFD1] shadow-[0_34px_100px_rgba(68,47,25,.13)] lg:min-h-[650px]">
            <Image src="/art/generated/products/products-hero-v1.png" alt="Avantiqo connected business operations" fill priority sizes="58vw" className="object-cover object-center" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(18,13,9,.01),rgba(18,13,9,.03)_55%,rgba(18,13,9,.34))]" />
            <div className="absolute left-6 top-6 rounded-full border border-white/70 bg-[#F8F0E6]/76 px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[.20em] text-[#8D6339] backdrop-blur-xl">ONE BUSINESS · ONE CONTEXT</div>
            <div className="absolute inset-x-6 bottom-6 rounded-[22px] border border-white/72 bg-[#F8F1E8]/90 p-5 text-[#2B251F] shadow-[0_18px_45px_rgba(0,0,0,.12)] backdrop-blur-xl sm:p-6">
              <div className="text-[7px] font-semibold uppercase tracking-[.20em] text-[#A36F39]">CONNECTED FROM THE FIRST CUSTOMER TOUCHPOINT</div>
              <div className="mt-2 max-w-2xl text-[15px] leading-6 text-[#5D5348]">Messages, bookings, payments, people, stock, finance, documents and intelligence can move through the same operating context.</div>
            </div>
          </div>
        </div>
      </section>

      <section id="what-avantiqo-does" className="border-b border-black/[0.06] bg-[#FBFAF8]">
        <div className="mx-auto max-w-[1540px] px-5 py-16 sm:px-7 lg:px-10 lg:py-24">
          <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">WHAT AVANTIQO DOES</p>
              <h2 className="mt-3 max-w-2xl text-[42px] font-medium leading-[.98] tracking-[-0.055em] sm:text-[58px]">Start with the outcome your business needs.</h2>
            </div>
            <p className="max-w-2xl text-[13px] leading-7 text-[#706A62] lg:justify-self-end">The landing page should make the value obvious before the customer learns the product names. These are the four jobs Avantiqo can help with immediately.</p>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            {PRIMARY_AREAS.map((item)=><ImageCard key={item.eyebrow} item={item} tall />)}
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#EEE6DB]">
        <div className="mx-auto max-w-[1540px] px-5 py-16 sm:px-7 lg:px-10 lg:py-22">
          <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">CONNECTED EXPERIENCE</p>
              <h2 className="mt-3 max-w-2xl text-[42px] font-medium leading-[.98] tracking-[-0.055em] sm:text-[58px]">The work keeps moving after the first interaction.</h2>
            </div>
            <p className="max-w-2xl text-[13px] leading-7 text-[#6F675F] lg:justify-self-end">A message can become a booking. A booking can open a customer portal. Payment can reconcile into finance. Staff and suppliers can see only the part of the same live record they need.</p>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {CONNECTED_AREAS.map((item)=><ImageCard key={item.label} item={item} />)}
          </div>
        </div>
      </section>

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
