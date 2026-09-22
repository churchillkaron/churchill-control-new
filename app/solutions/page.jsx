import Image from "next/image";
import Link from "next/link";
import PublicSiteHeader from "@/components/public/PublicSiteHeader";

export const metadata = {
  title: "Solutions | Avantiqo",
  description: "Industry-specific Avantiqo operating systems for restaurants, hotels, retail, pest control, accounting firms, construction, agencies and field service.",
};

const industries = [
  {slug:"restaurant", name:"Restaurant", image:"/art/generated/solutions/verticals/solution-restaurant-v1.png", copy:"POS, bookings, service, kitchen, stock, purchasing, workforce, customers, payments and finance in one operating context."},
  {slug:"hotel", name:"Hotel", image:"/art/generated/solutions/verticals/solution-hotel-v1.png", copy:"Rooms, arrivals, reservations, housekeeping, maintenance, guest service, people, payments and revenue connected."},
  {slug:"retail", name:"Retail", image:"/art/generated/solutions/verticals/solution-retail-v1.png", copy:"Sales, customers, inventory, purchasing, replenishment, staff and finance moving through one store operation."},
  {slug:"pest-control", name:"Pest Control", image:"/art/generated/solutions/verticals/solution-pest-control-v1.png", copy:"Sites, contracts, treatment protocols, technician dispatch, monitoring points, service evidence, reports, renewals and invoicing."},
  {slug:"accounting-firms", name:"Accounting Firms", image:"/art/generated/solutions/verticals/solution-accounting-v1.png", copy:"Client organizations, engagements, bookkeeping, close, review, corrections, requests, billing and controlled multi-client workflows."},
  {slug:"construction", name:"Construction", image:"/art/generated/solutions/verticals/solution-construction-v1.png", copy:"Projects, people, purchasing, suppliers, documents, approvals, cost control, progress and financial context across the job."},
  {slug:"agencies-professional-services", name:"Agencies & Professional Services", image:"/art/generated/solutions/verticals/solution-agency-v1.png", copy:"Clients, projects, scopes, approvals, creative delivery, time, documents, billing and team capacity in one service operation."},
  {slug:"field-service", name:"Field Service", image:"/art/generated/solutions/verticals/solution-field-service-v1.png", copy:"Dispatch, technician work, equipment, parts, evidence, service reports, invoicing and renewals from office to field."},
];

function StoryCard({item,index}) {
  return <Link href={`/solutions/${item.slug}`} className="group block overflow-hidden rounded-[26px] border border-black/[0.07] bg-[#F8F4EE] shadow-[0_14px_38px_rgba(42,32,22,.05)] transition hover:-translate-y-1 hover:shadow-[0_22px_55px_rgba(42,32,22,.10)]">
    <div className="relative h-[235px] overflow-hidden"><Image src={item.image} alt="" fill sizes="25vw" className="object-cover transition duration-700 group-hover:scale-[1.035]" /><div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.01),rgba(8,7,6,.05)_58%,rgba(8,7,6,.50))]" /><div className="absolute bottom-4 left-4 rounded-full border border-white/65 bg-[#F8F0E6]/68 px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[.18em] text-[#8D6339] backdrop-blur-xl">0{String(index+1).padStart(2,"0")} · {item.name}</div></div>
    <div className="p-5 sm:p-6"><h3 className="text-[22px] font-medium leading-[1.05] tracking-[-.04em] text-[#29251F]">{item.name}</h3><p className="mt-3 text-[10px] leading-5 text-[#756E66]">{item.copy}</p><div className="mt-5 text-[8px] font-semibold text-[#815B36]">Explore solution →</div></div>
  </Link>;
}

export default function Page() {
  return <main className="min-h-screen bg-[#F7F6F3] text-[#171614]">
    <PublicSiteHeader context="Solutions" audience="business" tone="light" />

    <section className="border-b border-[#CFC5B8]/55 bg-[#F3EEE5]">
      <div className="mx-auto grid max-w-[1540px] gap-10 px-5 py-14 sm:px-7 lg:min-h-[660px] lg:grid-cols-[.86fr_1.14fr] lg:items-center lg:px-10 lg:py-20">
        <div className="max-w-[625px]">
          <div className="inline-flex rounded-full border border-black/[0.08] bg-white/70 px-4 py-2 text-[8px] font-semibold uppercase tracking-[.18em] text-[#9A744B]">Industry solutions</div>
          <p className="mt-7 text-[9px] font-semibold uppercase tracking-[.24em] text-[#9A744B]">AVANTIQO SOLUTIONS</p>
          <h1 className="mt-5 text-[52px] font-medium leading-[.93] tracking-[-.065em] sm:text-[66px] xl:text-[78px]">A Business OS shaped around the company you actually run.</h1>
          <p className="mt-7 max-w-[590px] text-[16px] leading-8 text-[#625D55]">Restaurants, hotels, retail, pest control, accounting firms, construction, agencies and field-service businesses should not have to translate themselves into generic software.</p>
          <div className="mt-9 flex flex-wrap gap-2.5"><a href="#industries" className="inline-flex h-11 items-center rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white">Choose your industry</a><a href="/start" className="inline-flex h-11 items-center rounded-full border border-black/[0.10] bg-white/70 px-5 text-[10px] font-semibold text-[#5C554D]">Talk to Avantiqo</a></div>
        </div>
        <div className="relative min-h-[530px] overflow-hidden rounded-[34px] border border-black/[0.08] bg-[#E9DFD1] shadow-[0_34px_95px_rgba(68,47,25,.13)]">
          <Image src="/art/generated/solutions/solutions-hero-v1.png" alt="" fill priority sizes="58vw" className="object-cover" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.02),rgba(8,7,6,.05)_58%,rgba(8,7,6,.42))]" />
          <div className="absolute left-5 top-5 rounded-full border border-white/70 bg-[#F8F0E6]/74 px-3.5 py-1.5 text-[7px] font-semibold uppercase tracking-[.22em] text-[#8D6339] backdrop-blur-xl">AVANTIQO / INDUSTRY SOLUTIONS</div>
          <div className="absolute bottom-5 left-5 right-5 rounded-[22px] border border-white/72 bg-[#F8F1E8]/88 p-5 text-[#2B251F] shadow-[0_18px_45px_rgba(0,0,0,.12)] backdrop-blur-xl sm:p-6"><div className="text-[7px] font-semibold uppercase tracking-[.20em] text-[#A36F39]">REAL INDUSTRIES</div><div className="mt-2 max-w-2xl text-[15px] leading-6 text-[#5D5348]">The same platform, shaped around the language, workflows and evidence of the business being run.</div></div>
        </div>
      </div>
    </section>

    <section id="industries" className="border-b border-[#CFC5B8]/45 bg-[#FBFAF8]">
      <div className="mx-auto max-w-[1540px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end"><div><p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#9A744B]">MADE FOR THE BUSINESS BEING RUN</p><h2 className="mt-3 max-w-xl text-[42px] font-medium leading-[.98] tracking-[-.05em] sm:text-[56px]">One platform. Different operating worlds.</h2></div><p className="max-w-2xl text-[12px] leading-6 text-[#6E675F] lg:justify-self-end">Each solution uses the workflows and terminology that matter to that industry while organization, finance, people, documents and intelligence remain connected underneath.</p></div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{industries.map((item,index)=><StoryCard key={item.name} item={item} index={index}/>)}</div>
      </div>
    </section>

    <section className="border-b border-[#CFC5B8]/45 bg-[#EEE8DE]">
      <div className="mx-auto grid max-w-[1540px] gap-10 px-5 py-16 sm:px-7 lg:grid-cols-[.82fr_1.18fr] lg:items-center lg:px-10 lg:py-20">
        <div><p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#9A744B]">ONE OPERATING FOUNDATION</p><h2 className="mt-3 text-[40px] font-medium leading-[1.02] tracking-[-.05em] sm:text-[54px]">Industry-specific on the surface. Connected underneath.</h2><p className="mt-5 max-w-xl text-[12px] leading-6 text-[#6D665E]">The restaurant manager, accountant, technician and project manager do not need the same screens. They do need the same discipline around identity, permissions, business context, evidence and controlled actions.</p></div>
        <div className="relative min-h-[450px] overflow-hidden rounded-[30px] border border-black/[0.08] shadow-[0_24px_70px_rgba(56,39,22,.10)]"><Image src="/art/generated/solutions/solutions-worlds-v1.png" alt="" fill sizes="55vw" className="object-cover"/><div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.01),rgba(8,7,6,.38))]"/></div>
      </div>
    </section>

    <section className="border-b border-[#CFC5B8]/45 bg-[#FBFAF8]">
      <div className="mx-auto max-w-[1540px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20"><p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#9A744B]">CONTINUE THROUGH AVANTIQO</p><h2 className="mt-3 text-[40px] font-medium tracking-[-.05em] sm:text-[54px]">From implementation to partner delivery to enterprise scale.</h2>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">{[
          ["Services","/services","/art/generated/solutions/services-go-live-v3.png","Discovery, migration, configuration, integrations, training and verified go-live."],
          ["Partners","/partners","/art/generated/solutions/solutions-partners-v1.png","Accounting firms, agencies, consultants and specialists delivering repeatable client outcomes."],
          ["Enterprise","/enterprise","/art/generated/solutions/solutions-enterprise-v1.png","Multi-entity, multi-location governance, portfolio visibility and controlled operating scale."],
        ].map(([name,href,image,copy])=><Link href={href} key={name} className="overflow-hidden rounded-[28px] border border-black/[0.07] bg-[#F8F4EE] shadow-[0_16px_46px_rgba(45,34,22,.06)]"><div className="relative h-[260px] overflow-hidden"><Image src={image} alt="" fill sizes="33vw" className="object-cover"/><div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.01),rgba(8,7,6,.46))]"/><div className="absolute bottom-4 left-5 text-[20px] font-medium text-white">{name}</div></div><div className="p-5"><p className="text-[10px] leading-5 text-[#716A62]">{copy}</p><div className="mt-5 text-[8px] font-semibold text-[#815B36]">Explore {name} →</div></div></Link>)}</div>
      </div>
    </section>

    <section className="bg-[#EEE6DB] text-[#1D1B18]"><div className="mx-auto grid max-w-[1320px] gap-8 px-5 py-20 sm:px-7 lg:grid-cols-[1fr_auto] lg:items-center lg:px-10 lg:py-24"><div><p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A744B]">YOUR INDUSTRY. YOUR OPERATING MODEL.</p><h2 className="mt-4 max-w-4xl text-[44px] font-medium leading-[.98] tracking-[-.055em] sm:text-[60px]">Start from the business you already know.</h2><p className="mt-5 max-w-3xl text-[13px] leading-7 text-[#6D645B]">Then let Avantiqo connect the products, people, finance, evidence and intelligence around it.</p></div><a href="/start" className="inline-flex h-11 items-center rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white">Plan your solution</a></div></section>
  </main>;
}
