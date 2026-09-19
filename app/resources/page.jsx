import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import Image from "next/image";

export const metadata = { title: "Resources | Avantiqo", description: "Guides, research, playbooks, templates, benchmarks, case studies and product updates from Avantiqo." };

const GROUPS = [
  ["Guides","Learn how Avantiqo operating, creative, developer and compute layers work.","Start with practical product and implementation guidance."],
  ["Industry playbooks","See how restaurants, hotels, retail, construction, agencies and accounting firms can use the platform.","Turn one platform into industry-specific outcomes."],
  ["Research & benchmarks","Read practical analysis across operations, finance, AI, creative production and infrastructure.","Compare approaches and make better-informed operating decisions."],
  ["Case studies","Show real operating problems, implementation choices and measurable outcomes.","See how real problems can be solved in practice."],
  ["Templates","Reusable operating, campaign, document and workflow patterns for customers and partners.","Use proven templates to get useful work started faster."],
  ["Product updates","Track meaningful platform improvements, new capabilities and commercial releases.","See what has changed, what is new and how it affects your work."],
];

export default function ResourcesPage(){
  const images=["/art/developer-work.jpg","/art/commercial-solutions.jpg","/art/commercial-insights.jpg","/art/commercial-commerce.jpg","/art/generated/products/products-documents-v1.png","/art/commercial-agents.jpg"];
  return <main className="min-h-screen bg-[#F7F6F3] text-[#171614]">
    <PublicSiteHeader context="Resources" audience="platform"/>
    <section className="relative overflow-hidden border-b border-black/[0.06] bg-[#F4F0E8]">
      <div className="mx-auto grid max-w-[1540px] lg:min-h-[650px] lg:grid-cols-[44%_56%]">
        <div className="flex items-center px-5 py-16 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-[#9A744B]">AVANTIQO / RESOURCES</p>
            <h1 className="mt-5 max-w-3xl text-[52px] font-medium leading-[.96] tracking-[-0.06em] sm:text-[70px]">Learn from the work, not generic software theory.</h1>
            <p className="mt-7 max-w-xl text-[15px] leading-8 text-[#6D675F]">Guides, industry playbooks, benchmarks, case studies and templates tied to the operating, creative and technical work Avantiqo is built to perform.</p>
          </div>
        </div>
        <div className="relative m-5 min-h-[500px] overflow-hidden rounded-[34px] border border-black/[0.08] bg-[#E9DFD1] shadow-[0_34px_95px_rgba(68,47,25,.13)] sm:m-7 lg:ml-0 lg:min-h-0 lg:self-stretch">
          <Image src="/art/commercial-insights.jpg" alt="Avantiqo resources and business insight" fill priority sizes="56vw" className="object-cover" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.01),rgba(20,15,10,.03)_52%,rgba(20,15,10,.22))]" />
          <div className="absolute bottom-5 left-5 right-5 rounded-[22px] border border-white/72 bg-[#F8F1E8]/88 p-5 text-[#2B251F] shadow-[0_24px_70px_rgba(40,28,18,.14)] backdrop-blur-xl">
            <div className="text-[7px] font-semibold uppercase tracking-[.20em] text-[#A36F39]">KNOWLEDGE → DECISION → WORK</div>
            <div className="mt-3 text-[15px] leading-6 text-[#5D5348]">Understand the pattern, see the evidence, then move directly into the Avantiqo workflow that can act on it.</div>
          </div>
        </div>
      </div>
    </section>
    <section className="bg-[#FBFAF8]"><div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-24">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{GROUPS.map(([t,d,b],i)=><article key={t} className="group overflow-hidden rounded-[26px] border border-black/[0.075] bg-white shadow-[0_14px_40px_rgba(40,30,20,.03)] transition hover:-translate-y-0.5 hover:border-[#D6A66A]/35">
        <div className="relative h-[145px] overflow-hidden bg-[#E9DFD1]"><div className="absolute inset-0 bg-cover bg-center transition duration-700 group-hover:scale-[1.04]" style={{backgroundImage:`url(${images[i]})`}}/><div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.01),rgba(12,8,5,.38))]"/><div className="absolute left-4 top-4 rounded-full border border-white/50 bg-[#F7F0E7]/55 px-2.5 py-1 text-[8px] font-bold text-[#8A633C] backdrop-blur-md">0{i+1}</div></div>
        <div className="p-6"><h2 className="text-[25px] font-medium tracking-[-0.04em]">{t}</h2><p className="mt-3 text-[11px] leading-6 text-[#746F68]">{d}</p><div className="mt-7 border-t border-black/[0.06] pt-4 text-[9px] leading-5 text-[#9A744B]">{b}</div></div>
      </article>)}</div>
    </div></section>
    <section className="border-t border-black/[0.06] bg-[#F3EFE7]"><div className="mx-auto max-w-[1120px] px-5 py-20 text-center sm:px-7 lg:px-10"><p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">FROM LEARNING TO ACTION</p><h2 className="mx-auto mt-4 max-w-3xl text-[40px] font-medium leading-[1.02] tracking-[-0.05em] sm:text-[54px]">Use the knowledge. Then enter the right Avantiqo world.</h2><div className="mt-8 flex flex-wrap justify-center gap-2.5"><a href="/start" className="inline-flex h-11 items-center rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white">Start Now →</a><a href="/solutions" className="inline-flex h-11 items-center rounded-full border border-[#D6A66A]/38 bg-white/72 px-5 text-[10px] font-semibold text-[#6A5540]">Explore Solutions</a></div></div></section>
  </main>;
}
