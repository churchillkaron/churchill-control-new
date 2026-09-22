import Image from "next/image";
import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import { productCatalog } from "@/components/public/productCatalog";
import { CUSTOMER_GROUPS, isCustomerProduct } from "@/components/public/customerProductGroups";

const customerProducts = productCatalog.filter(isCustomerProduct);

const GROUP_ART = {
  "run-business": "/art/generated/products/products-run-business-v1.png",
  people: "/art/generated/products/products-people-v1.png",
  finance: "/art/generated/products/products-finance-v1.png",
  stock: "/art/generated/products/products-stock-v1.png",
  documents: "/art/generated/products/products-documents-v1.png",
  intelligence: "/art/generated/products/products-intelligence-v2.png",
  creative: "/art/generated/products/products-creative-v2.png",
  industry: "/art/generated/products/products-industry-v2.png",
};

function StoryImage({ src, label, className = "" }) {
  return (
    <div className={`relative overflow-hidden rounded-[30px] border border-black/[0.08] bg-[#E9DFD1] shadow-[0_24px_70px_rgba(56,39,22,.10)] ${className}`}>
      <Image src={src} alt="" fill sizes="50vw" className="object-cover" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.01),rgba(8,7,6,.05)_58%,rgba(8,7,6,.46))]" />
      {label ? <div className="absolute left-5 top-5 rounded-full border border-white/70 bg-[#F8F0E6]/72 px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[.20em] text-[#8D6339] backdrop-blur-xl">{label}</div> : null}
    </div>
  );
}


function BusinessPartnerSystemArt() {
  const attention = [["01","Revenue","Sales evidence connected","Review"],["02","People","Attendance exception detected","Review"],["03","Finance","Invoices need attention","Review"]];
  return (
    <div className="relative min-h-[460px] overflow-hidden rounded-[30px] border border-[#C8B7A0]/45 bg-[linear-gradient(135deg,#FFF9F0_0%,#F3E7D7_52%,#E7C99F_100%)] p-5 shadow-[0_28px_80px_rgba(48,32,18,.10)] sm:p-6">
      <div className="relative flex h-full min-h-[420px] flex-col rounded-[24px] border border-white/70 bg-white/42 p-5 backdrop-blur-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4 border-b border-[#B9A58A]/20 pb-5"><div><div className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#9A6A37]">AVANTIQO BUSINESS PARTNER</div><div className="mt-1 text-[8px] text-[#8B7D6C]">Connected business context</div></div><div className="flex items-center gap-2 text-[7px] font-semibold uppercase tracking-[.14em] text-[#7C6C5B]"><span className="h-1.5 w-1.5 rounded-full bg-[#B98548]"/>Ready</div></div>
        <div className="mt-5 grid flex-1 gap-4 lg:grid-cols-[.82fr_1.18fr]">
          <div className="rounded-[20px] border border-black/[0.06] bg-white/56 p-5"><div className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#9A744B]">BUSINESS PARTNER</div><div className="mt-5 text-[20px] font-medium leading-[1.2] tracking-[-.035em] text-[#2B2722]">Tell me what you need done.</div><p className="mt-4 text-[9px] leading-5 text-[#6E655B]">Investigate, explain, plan, execute approved work across Avantiqo, verify the result and keep the evidence connected.</p><div className="mt-6 flex flex-wrap gap-1.5">{["POS","Finance","Workforce","Inventory","Projects"].map(x=><span key={x} className="rounded-full border border-black/[0.07] bg-white/50 px-2.5 py-1 text-[6px] font-semibold tracking-[.12em] text-[#776A5D]">{x}</span>)}</div></div>
          <div className="space-y-2.5">{attention.map(([no,title,desc,action])=><div key={title} className="grid grid-cols-[34px_1fr_auto] items-center gap-3 rounded-[16px] border border-black/[0.06] bg-white/54 px-4 py-3.5"><div className="text-[7px] font-bold text-[#A66F34]">{no}</div><div><div className="text-[10px] font-semibold text-[#302A24]">{title}</div><div className="mt-1 text-[7px] text-[#8A7B6B]">{desc}</div></div><div className="text-[7px] font-semibold text-[#7B6A58]">{action} →</div></div>)}</div>
        </div>
        <div className="mt-5 rounded-[18px] border border-black/[0.07] bg-white/56 p-3.5"><div className="flex items-center gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#D6A66A]/50 bg-[#F4E4CF] text-[9px] font-semibold text-[#8E643B]">A</div><div className="flex-1 text-[9px] text-[#827465]">Ask, create, fix, reconcile, schedule, review…</div><div className="text-[#A76F34]">→</div></div></div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[6px] font-semibold uppercase tracking-[.14em] text-[#927F6C]"><span>Evidence connected</span><span>Actions governed</span><span>Results recorded</span></div>
      </div>
    </div>
  );
}

function IntelligenceOrchestrationArt() {
  const stages=[["01","Context","Live business evidence"],["02","Reason","Understand what matters"],["03","Plan","Choose exact capabilities"],["04","Act","Execute within authority"],["05","Verify","Check the real outcome"]];
  return (
    <div className="relative min-h-[390px] overflow-hidden rounded-[30px] border border-[#C8B7A0]/45 bg-[linear-gradient(135deg,#FFF9F0_0%,#F2E5D4_56%,#E6C79C_100%)] p-5 shadow-[0_24px_70px_rgba(56,39,22,.08)]">
      <div className="relative flex min-h-[350px] flex-col rounded-[22px] border border-white/70 bg-white/38 p-5 backdrop-blur-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4 border-b border-black/[0.06] pb-4"><div><div className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#9A6A37]">AVANTIQO / AI & INTELLIGENCE</div><div className="mt-1 text-[8px] text-[#8C7C6C]">One intelligence layer across the operating system</div></div><div className="rounded-full border border-black/[0.07] bg-white/46 px-2.5 py-1 text-[6px] font-semibold uppercase tracking-[.14em] text-[#786B5E]">LIVE CONTEXT</div></div>
        <div className="mt-5 grid gap-3 md:grid-cols-5">{stages.map(([no,title,desc],index)=><div key={title} className="relative rounded-[16px] border border-black/[0.06] bg-white/52 p-4"><div className="text-[7px] font-bold text-[#A66F34]">{no}</div><div className="mt-7 text-[11px] font-semibold text-[#2F2923]">{title}</div><div className="mt-1 text-[7px] leading-4 text-[#8A7C6E]">{desc}</div>{index<stages.length-1?<div className="absolute -right-2 top-1/2 hidden text-[10px] text-[#A66F34]/60 md:block">→</div>:null}</div>)}</div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">{["Business Partner · conversational operator","Agents · specialist execution","Insights · live operating signals"].map(item=><div key={item} className="rounded-[14px] border border-black/[0.06] bg-white/50 px-4 py-3 text-[8px] text-[#74685D]">{item}</div>)}</div>
        <div className="mt-auto pt-5 text-[6px] font-semibold uppercase tracking-[.15em] text-[#8E7B68]">Organization scoped · governed actions · independent verification · durable proof</div>
      </div>
    </div>
  );
}

function CommunicationsSystemArt() {
  const inbox = [
    ["WA", "Sophie Tan", "WhatsApp", "Do you have availability for next weekend?"],
    ["LN", "Marco Bianchi", "LINE", "Amazing experience, thank you!"],
    ["MS", "Daniel Kim", "Messenger", "Could you share more details?"],
    ["IG", "Priya Sharma", "Instagram", "Is late checkout possible?"],
  ];
  const reviews = [
    ["5.0", "Emma L.", "Incredible experience — the team went above and beyond.", "REPLIED"],
    ["4.0", "James K.", "Beautiful location and excellent service.", "APPROVED"],
    ["2.0", "Olivia M.", "Check-in was slower than expected.", "ESCALATED"],
  ];
  return (
    <div data-art="communications-system" className="relative min-h-[440px] overflow-hidden rounded-[30px] border border-[#B99769]/22 bg-[radial-gradient(circle_at_12%_12%,#fffaf1_0%,#f1e4cf_42%,#c99a62_100%)] p-4 shadow-[0_28px_70px_rgba(64,43,23,.14)] sm:p-5">
      <div className="absolute -left-16 top-10 h-48 w-48 rounded-full bg-white/45 blur-3xl" />
      <div className="absolute -right-14 bottom-0 h-56 w-56 rounded-full bg-[#815329]/22 blur-3xl" />
      <div className="relative grid min-h-[400px] gap-3 rounded-[26px] border border-white/65 bg-white/38 p-3 backdrop-blur-2xl lg:grid-cols-[.83fr_1.02fr_1.15fr]">
        <aside className="rounded-[20px] border border-white/70 bg-[#F8F0E4]/86 p-4 shadow-[0_14px_30px_rgba(68,45,22,.08)]">
          <div className="text-[8px] font-semibold uppercase tracking-[.22em] text-[#8C643F]">AVANTIQO</div>
          <div className="mt-7 text-[7px] font-semibold uppercase tracking-[.16em] text-[#9E866D]">Connected channels</div>
          <div className="mt-3 space-y-2">{[["IN","Inbox","12"],["★","Reviews","4"],["✓","Approvals","2"],["↗","Analytics",""]].map(([icon,label,count])=><div key={label} className="flex items-center gap-3 rounded-[12px] px-2.5 py-2 text-[8px] text-[#5C5146]"><span className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-black/[0.07] bg-white/68 text-[7px] font-bold text-[#9A7045]">{icon}</span><span className="flex-1 font-semibold">{label}</span>{count?<span className="rounded-full bg-[#B98B54]/18 px-2 py-1 text-[6px] font-bold text-[#8A643E]">{count}</span>:null}</div>)}</div>
          <div className="mt-8 text-[6px] font-semibold uppercase leading-4 tracking-[.20em] text-[#9F866C]">REAL CONVERSATIONS<br/>ONE CUSTOMER HISTORY</div>
        </aside>
        <section className="rounded-[20px] border border-white/70 bg-[#FBF6ED]/86 p-4 shadow-[0_14px_30px_rgba(68,45,22,.08)]">
          <div className="flex items-center justify-between"><div><div className="text-[17px] font-semibold tracking-[-.03em] text-[#2A2520]">Unified Inbox</div><div className="mt-1 text-[7px] text-[#948675]">WhatsApp · LINE · Messenger · Instagram · Email</div></div><span className="rounded-full border border-black/[0.07] bg-white/60 px-2.5 py-1 text-[6px] font-semibold text-[#786B5E]">ALL CHANNELS</span></div>
          <div className="mt-4 space-y-2">{inbox.map(([icon,name,channel,msg],i)=><div key={name} className={`rounded-[14px] border px-3 py-2.5 ${i===0?'border-[#D8B27B]/60 bg-[#FFF8EC]':'border-black/[0.06] bg-white/42'}`}><div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#201E1B] text-[7px] font-bold text-[#F1C98E]">{icon}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="text-[9px] font-semibold text-[#312B25]">{name}</span><span className="text-[6px] text-[#AA9B8B]">{channel}</span></div><div className="mt-1 truncate text-[7px] text-[#8E8173]">{msg}</div></div></div></div>)}</div>
          <div className="mt-4 rounded-[14px] border border-black/[0.07] bg-white/54 p-3"><div className="text-[7px] text-[#A19588]">AI-assisted reply</div><div className="mt-2 text-[9px] leading-4 text-[#4E453D]">Yes, we do. I can share availability and the best options for your request.</div><div className="mt-3 flex justify-between"><span className="text-[6px] text-[#9E8C79]">ROUTE · APPROVE · SEND</span><span className="rounded-full bg-[#B68348] px-3 py-1 text-[6px] font-semibold text-white">SEND →</span></div></div>
        </section>
        <section className="rounded-[20px] border border-white/70 bg-[#FBF6ED]/86 p-4 shadow-[0_14px_30px_rgba(68,45,22,.08)]">
          <div className="flex items-start justify-between"><div><div className="text-[17px] font-semibold tracking-[-.03em] text-[#2A2520]">Reputation</div><div className="mt-1 text-[7px] text-[#948675]">Google + Facebook review evidence</div></div><span className="rounded-full border border-black/[0.07] bg-white/60 px-2.5 py-1 text-[6px] font-semibold text-[#786B5E]">30 DAYS</span></div>
          <div className="mt-4 grid grid-cols-3 gap-2">{[["4.8","Rating"],["321","Reviews"],["96%","Response"]].map(([v,l])=><div key={l} className="rounded-[13px] border border-black/[0.06] bg-white/44 p-3"><div className="text-[16px] font-semibold tracking-[-.04em] text-[#2C2722]">{v}</div><div className="mt-1 text-[6px] uppercase tracking-[.12em] text-[#A08E7C]">{l}</div></div>)}</div>
          <div className="mt-4 space-y-2">{reviews.map(([rating,name,msg,state])=><div key={name} className="rounded-[14px] border border-black/[0.06] bg-white/42 p-3"><div className="flex items-start gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F2E0C7] text-[7px] font-bold text-[#8F653B]">★</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><div><span className="text-[8px] font-semibold text-[#302A24]">{name}</span><span className="ml-2 text-[7px] text-[#C69047]">{rating}</span></div><span className={`rounded-full px-2 py-1 text-[5px] font-bold ${state==='ESCALATED'?'bg-[#D97055]/12 text-[#B95842]':'bg-[#668B63]/12 text-[#597C57]'}`}>{state}</span></div><div className="mt-1 text-[7px] leading-3.5 text-[#8B7F72]">{msg}</div></div></div></div>)}</div>
          <div className="mt-4 rounded-[14px] border border-[#D6A66A]/25 bg-[#F5E8D6]/70 p-3 text-[7px] leading-4 text-[#7D6B59]"><span className="font-semibold text-[#8E653D]">AI Assistant</span> drafts replies, detects sentiment, routes approvals and opens recovery work when needed.</div>
        </section>
      </div>
      <div className="relative mx-auto mt-3 flex max-w-[78%] flex-wrap justify-center gap-x-5 gap-y-1 rounded-full border border-white/65 bg-white/45 px-5 py-2.5 text-[6px] font-semibold uppercase tracking-[.13em] text-[#765F47] backdrop-blur-xl"><span>READ</span><span>→</span><span>ANSWER</span><span>→</span><span>ROUTE</span><span>→</span><span>APPROVE</span><span>→</span><span>ACT</span></div>
    </div>
  );
}

function WebCommerceSystemArt() {
  return (
    <div className="relative min-h-[390px] overflow-hidden rounded-[30px] border border-[#C8B7A0]/45 bg-[linear-gradient(135deg,#FFF9F0_0%,#F1E4D2_58%,#E5C69B_100%)] p-5 shadow-[0_24px_70px_rgba(56,39,22,.08)]">
      <div className="grid min-h-[350px] gap-4 lg:grid-cols-[1.08fr_.92fr]">
        <div className="overflow-hidden rounded-[20px] border border-black/[0.07] bg-white/72 shadow-[0_18px_40px_rgba(65,45,24,.07)]"><div className="flex h-9 items-center gap-1.5 border-b border-black/[0.06] bg-[#FBF7F1] px-4"><span className="h-1.5 w-1.5 rounded-full bg-[#CFC4B4]"/><span className="h-1.5 w-1.5 rounded-full bg-[#CFC4B4]"/><span className="h-1.5 w-1.5 rounded-full bg-[#CFC4B4]"/><div className="ml-3 text-[6px] font-semibold tracking-[.14em] text-[#9A744B]">AVANTIQO WEBSITE BUILD</div></div><div className="relative h-[300px] overflow-hidden"><Image src="/art/commercial-commerce.jpg" alt="" fill sizes="40vw" className="object-cover opacity-90"/><div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.01),rgba(25,18,12,.24))]"/><div className="absolute bottom-5 left-5 right-5"><div className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#F4D2A1]">WEBSITE · STOREFRONT · CONTENT</div><div className="mt-2 max-w-sm text-[22px] font-medium leading-[1.03] tracking-[-.04em] text-white">Customer-facing experiences built from the same business context.</div></div></div></div>
        <div className="flex flex-col rounded-[20px] border border-black/[0.07] bg-white/54 p-5"><div className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#9A6A37]">CONNECTED COMMERCE</div><div className="mt-5 space-y-2.5">{[["01","Products","Catalog stays connected"],["02","Orders","Sales become business events"],["03","Inventory","Stock state reconciles"],["04","Finance","Settlement reaches accounting"]].map(([n,t,d])=><div key={t} className="rounded-[14px] border border-black/[0.06] bg-white/58 p-3.5"><div className="flex items-center justify-between"><span className="text-[7px] font-bold text-[#A66F34]">{n}</span><span className="text-[9px] font-semibold text-[#302A24]">{t}</span></div><div className="mt-2 text-[7px] text-[#8A7C6E]">{d}</div></div>)}</div><div className="mt-auto pt-5 text-[6px] font-semibold uppercase tracking-[.14em] text-[#8B7865]">BUILD · VALIDATE · PUBLISH · SYNC</div></div>
      </div>
    </div>
  );
}

function MarketsSystemArt() {
  return (
    <div className="relative min-h-[390px] overflow-hidden rounded-[30px] border border-[#C8B7A0]/45 bg-[#F2E7D8] shadow-[0_24px_70px_rgba(56,39,22,.08)]">
      <Image src="/art/generated/products/markets-approved.png" alt="Avantiqo Markets intelligence and paper trading workspace" fill sizes="55vw" className="object-cover object-center" priority={false} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.02),rgba(30,20,12,.12))]" />
      <div className="absolute left-5 top-5 rounded-full border border-white/65 bg-white/38 px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[.16em] text-[#805A34] backdrop-blur-md">AVANTIQO / MARKETS</div>
      <div className="absolute bottom-5 left-5 right-5 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-white/65 bg-white/44 px-4 py-3 backdrop-blur-xl">
        <div className="text-[7px] font-semibold uppercase tracking-[.13em] text-[#765E47]">LIVE DATA · RESEARCH · RISK · PAPER EXECUTION · LEARN</div>
        <div className="rounded-full border border-[#B98A52]/35 bg-white/52 px-3 py-1 text-[6px] font-semibold uppercase tracking-[.13em] text-[#8B6237]">PAPER MODE</div>
      </div>
    </div>
  );
}

function PortalExperienceArt({ compact = false }) {
  const panes = [
    ["Customer", "/art/generated/solutions/verticals/solution-hotel-v1.png", "Bookings · payments · documents · messages", "/products/customer-portal"],
    ["Staff", "/art/generated/products/products-people-v1.png", "Work · shifts · requests · payroll", "/staff-portal"],
    ["Supplier", "/art/generated/products/products-stock-v1.png", "Invitation · customer-scoped identity · governed access", "/supplier-portal"],
  ];
  return (
    <div className={`relative overflow-hidden bg-[#EDE3D5] ${compact ? "h-full" : "min-h-[390px] rounded-[30px] border border-[#C8B7A0]/45 p-4 shadow-[0_24px_70px_rgba(56,39,22,.08)] sm:p-5"}`}>
      <div className={`${compact ? "absolute inset-0 grid grid-cols-3" : "relative grid min-h-[350px] grid-cols-3 gap-2 rounded-[24px] border border-white/70 bg-white/30 p-2 backdrop-blur-sm"}`}>
        {panes.map(([title,image,detail,href])=>{
          const imageClass=title==="Supplier" ? "object-cover object-[52%_72%] scale-[1.16] transition duration-700 group-hover/portal:scale-[1.19]" : "object-cover transition duration-700 group-hover/portal:scale-[1.03]";
          const body=<><Image src={image} alt="" fill sizes={compact ? "10vw" : "18vw"} className={imageClass} /><div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.01),rgba(25,18,12,.08)_52%,rgba(25,18,12,.58))]" /><div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4"><div className="text-[9px] font-semibold tracking-[-.02em] text-white sm:text-[12px]">{title}</div>{!compact ? <div className="mt-1 text-[6px] leading-3 text-white/70 sm:text-[7px]">{detail}</div> : null}</div></>;
          return compact ? <div key={title} className="group/portal relative overflow-hidden rounded-[18px] border border-white/60 bg-[#E9DFD1]">{body}</div> : <a key={title} href={href} className="group/portal relative overflow-hidden rounded-[18px] border border-white/60 bg-[#E9DFD1]">{body}</a>;
        })}
      </div>
      {!compact ? <div className="absolute bottom-7 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/72 bg-[#F8F1E8]/90 px-5 py-2.5 text-center shadow-[0_14px_35px_rgba(55,39,22,.12)] backdrop-blur-xl"><div className="text-[6px] font-semibold uppercase tracking-[.18em] text-[#A36F39]">ONE BUSINESS CONTEXT</div><div className="mt-1 whitespace-nowrap text-[7px] text-[#6D6257]">Different people · exact permissions · same live records</div></div> : null}
    </div>
  );
}

function GroupChooserArt({ group }) {
  if (group.id === "portals-external") return <PortalExperienceArt compact />;
  if (group.id === "communications-reputation") return (
    <div className="relative h-full overflow-hidden bg-[#EEE3D4]">
      <Image src="/art/generated/products/communications-reputation-approved.png" alt="" fill sizes="25vw" className="object-cover object-[54%_48%] scale-[1.16] transition duration-700 group-hover:scale-[1.20]" />
    </div>
  );
  if (group.id === "markets") return (
    <div className="relative h-full overflow-hidden bg-[#EEE3D4]">
      <Image src="/art/generated/products/markets-approved.png" alt="" fill sizes="25vw" className="object-cover object-[52%_45%] scale-[1.12] transition duration-700 group-hover:scale-[1.16]" />
    </div>
  );
  if (group.id === "web-commerce") return <div className="relative h-full"><Image src="/art/commercial-commerce.jpg" alt="" fill sizes="25vw" className="object-cover"/><div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.01),rgba(20,14,9,.32))]"/><div className="absolute bottom-5 left-5 text-[9px] font-semibold tracking-[.14em] text-white">WEB · STORE · COMMERCE</div></div>;
  return <Image src={GROUP_ART[group.id]} alt="" fill sizes="25vw" className="object-cover transition duration-700 group-hover:scale-[1.035]" />;
}

function HeroArt() {
  return (
    <div className="relative min-h-[525px] overflow-hidden rounded-[34px] border border-black/[0.08] bg-[#E9DFD1] shadow-[0_34px_95px_rgba(68,47,25,.13)]">
      <Image src="/art/generated/products/products-hero-v1.png" alt="" fill priority sizes="58vw" className="object-cover object-center" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.02),rgba(8,7,6,.05)_58%,rgba(8,7,6,.42))]" />
      <div className="absolute left-5 top-5 rounded-full border border-white/70 bg-[#F8F0E6]/74 px-3.5 py-1.5 text-[7px] font-semibold uppercase tracking-[.22em] text-[#8D6339] backdrop-blur-xl">AVANTIQO / PRODUCTS</div>
      <div className="absolute bottom-5 left-5 right-5 rounded-[22px] border border-white/72 bg-[#F8F1E8]/88 p-5 text-[#2B251F] shadow-[0_18px_45px_rgba(0,0,0,.12)] backdrop-blur-xl sm:p-6">
        <div className="text-[7px] font-semibold uppercase tracking-[.20em] text-[#A36F39]">REAL BUSINESS · ONE CONTEXT</div>
        <div className="mt-2 max-w-2xl text-[15px] leading-6 text-[#5D5348]">Customers, people, money, stock and work moving together in one business context.</div>
      </div>
    </div>
  );
}

export default function ProductsCatalogPage() {
  return (
    <main className="min-h-screen bg-[#F7F6F3] text-[#171614]">
      <PublicSiteHeader context="Products" audience="business" tone="light" />

      <section className="border-b border-[#CFC5B8]/55 bg-[#F3EEE5]">
        <div className="mx-auto grid max-w-[1540px] gap-10 px-5 py-14 sm:px-7 lg:min-h-[650px] lg:grid-cols-[.86fr_1.14fr] lg:items-center lg:px-10 lg:py-20">
          <div className="max-w-[620px]">
            <p className="text-[9px] font-semibold uppercase tracking-[.24em] text-[#9A744B]">AVANTIQO PRODUCTS</p>
            <h1 className="mt-5 text-[52px] font-medium leading-[.93] tracking-[-.065em] sm:text-[66px] xl:text-[78px]">Start with what your business needs now.</h1>
            <p className="mt-7 max-w-[590px] text-[16px] leading-8 text-[#625D55]">Choose one business problem, solve it properly, and expand only when the next connected capability creates value.</p>
            <div className="mt-9 flex flex-wrap gap-2.5">
              <a href="#choose" className="inline-flex h-11 items-center rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white shadow-[0_9px_28px_rgba(20,18,15,.16)]">Choose by business need</a>
              <a href="/products/all" className="inline-flex h-11 items-center rounded-full border border-black/[0.10] bg-white/70 px-5 text-[10px] font-semibold text-[#5C554D]">Search all products</a>
            </div>
            <div className="mt-10 grid max-w-[560px] grid-cols-3 border-t border-black/[0.08] pt-5">
              {["Start focused","Stay connected","Expand when useful"].map((item,index)=><div key={item} className={index ? "border-l border-black/[0.07] pl-4" : "pr-4"}><div className="text-[7px] font-semibold uppercase tracking-[.15em] text-[#9A744B]">0{index+1}</div><div className="mt-2 text-[9px] leading-4 text-[#716A62]">{item}</div></div>)}
            </div>
          </div>
          <HeroArt />
        </div>
      </section>

      <section id="choose" className="border-b border-[#CFC5B8]/45 bg-[#FBFAF8]">
        <div className="mx-auto max-w-[1540px] px-5 py-14 sm:px-7 lg:px-10 lg:py-18">
          <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#9A744B]">CHOOSE BY BUSINESS NEED</p>
              <h2 className="mt-3 max-w-xl text-[42px] font-medium leading-[.98] tracking-[-.05em] sm:text-[56px]">Where do you want to improve first?</h2>
            </div>
            <p className="max-w-2xl text-[12px] leading-6 text-[#6E675F] lg:justify-self-end">Every visual below represents the real work that product area supports. Choose the operating problem first, not the software module.</p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {CUSTOMER_GROUPS.map((group,index)=>(
              <a key={group.id} href={`/products/all?group=${encodeURIComponent(group.id)}`} className="group overflow-hidden rounded-[26px] border border-black/[0.07] bg-[#F8F4EE] shadow-[0_14px_38px_rgba(42,32,22,.05)] transition hover:-translate-y-1 hover:shadow-[0_22px_55px_rgba(42,32,22,.10)]">
                <div className="relative h-[215px] overflow-hidden">
                  <GroupChooserArt group={group} />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.01),rgba(8,7,6,.07)_60%,rgba(8,7,6,.48))]" />
                  <div className="absolute bottom-4 left-4 rounded-full border border-white/15 bg-[#11100E]/62 px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[.18em] text-[#F0C98F] backdrop-blur-xl">0{index+1} · {group.label}</div>
                </div>
                <div className="p-5">
                  <h3 className="text-[21px] font-medium leading-[1.05] tracking-[-.04em] text-[#29251F]">{group.headline}</h3>
                  <p className="mt-3 text-[10px] leading-5 text-[#756E66]">{group.description}</p>
                  <div className="mt-5 text-[8px] font-semibold text-[#815B36]">Explore products →</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#CFC5B8]/45 bg-[#EEE7DD]">
        <div className="mx-auto grid max-w-[1540px] gap-8 px-5 py-10 sm:px-7 lg:grid-cols-[.75fr_1.25fr] lg:px-10">
          <div>
            <p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#9A6531]">BUILT AROUND YOUR BUSINESS</p>
            <h2 className="mt-3 text-[30px] font-medium tracking-[-.04em]">Start focused. Expand when you are ready.</h2>
          </div>
          <p className="max-w-3xl text-[12px] leading-6 text-[#6E675F]">A restaurant can begin with POS. A hotel can begin with front desk. An employer can begin with Workforce. Finance can begin with invoicing. Each one stays connected to the same business context.</p>
        </div>
      </section>

      <section className="border-b border-black/[0.08] bg-[#F4F0E8]">
        <div className="mx-auto max-w-[1540px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[.7fr_1.3fr] lg:items-end">
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#9A6531]">HOW AVANTIQO CONNECTS THE WORK</p>
              <h2 className="mt-3 text-[38px] font-medium leading-[1.01] tracking-[-.05em] sm:text-[52px]">One action can move the whole business forward.</h2>
            </div>
            <p className="max-w-2xl text-[12px] leading-6 text-[#6E675F] lg:justify-self-end">The value is in the connection between the work people already do.</p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            {[
              ["A sale happens","/art/generated/products/products-run-business-v1.png",["POS sale","Stock changes","Revenue posts","Payment reconciles","Business Partner understands it"]],
              ["A person starts work","/art/generated/products/products-people-v1.png",["Clock in","Schedule updates","Hours accumulate","Payroll uses the record","Finance receives the result"]],
            ].map(([title,image,steps])=>(
              <div key={title} className="overflow-hidden rounded-[28px] border border-black/[0.08] bg-[#FBF8F2] shadow-[0_18px_52px_rgba(55,39,22,.07)]">
                <div className="relative h-[260px] overflow-hidden">
                  <Image src={image} alt="" fill sizes="50vw" className="object-cover" />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.01),rgba(8,7,6,.48))]" />
                  <div className="absolute bottom-5 left-5 text-[18px] font-medium text-white">{title}</div>
                </div>
                <div className="grid gap-2 p-5 sm:grid-cols-5 sm:p-6">
                  {steps.map((step,index)=><div key={step} className="rounded-[14px] border border-black/[0.07] bg-white/65 px-3 py-4"><div className="text-[7px] font-semibold text-[#A56F34]">0{index+1}</div><div className="mt-2 text-[8px] leading-4 text-[#655E56]">{step}</div></div>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#CFC5B8]/45 bg-[#EEE8DE]">
        <div className="mx-auto grid max-w-[1540px] gap-10 px-5 py-16 sm:px-7 lg:grid-cols-[.82fr_1.18fr] lg:items-center lg:px-10 lg:py-20">
          <div>
            <p className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#9A744B]">BUSINESS PARTNER</p>
            <h2 className="mt-3 text-[40px] font-medium leading-[1.02] tracking-[-.05em] sm:text-[54px]">Ask. Decide. Act. Verify.</h2>
            <p className="mt-5 max-w-xl text-[12px] leading-6 text-[#6D665E]">Business Partner is Avantiqo’s conversational operator. It can read live business evidence, reason across Finance, People, Operations, Supply Chain, Documents and more, plan the work, execute the exact capabilities you approve, verify the result and keep proof of what happened.</p>
            <a href="/intelligence-platform" className="mt-7 inline-flex h-11 items-center rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white">Explore Business Partner →</a>
          </div>
          <BusinessPartnerSystemArt />
        </div>
      </section>

      <section className="border-b border-[#CFC5B8]/45 bg-[#F7F3EC]">
        <div className="mx-auto grid max-w-[1320px] gap-8 px-5 py-14 sm:px-7 lg:grid-cols-[1fr_auto] lg:items-center lg:px-10 lg:py-16">
          <div><p className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#9A744B]">NEED THE COMPLETE CATALOG?</p><h2 className="mt-3 text-[34px] font-medium tracking-[-.045em]">Search every product without making this page feel like a database.</h2><p className="mt-3 max-w-3xl text-[11px] leading-6 text-[#6F685F]">The full catalog now lives in a dedicated searchable view. Filter by business need, team, industry or product name when you need exact product detail.</p></div>
          <a href="/products/all" className="inline-flex h-11 items-center rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white">Search all products →</a>
        </div>
      </section>

      <section className="border-b border-[#CFC5B8]/45 bg-[#F3EEE5]">
        <div className="mx-auto grid max-w-[1320px] gap-8 px-5 py-16 sm:px-7 lg:grid-cols-[1fr_auto] lg:items-center lg:px-10">
          <div>
            <p className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#9A744B]">BUILDING WITH AVANTIQO?</p>
            <h2 className="mt-3 text-[34px] font-medium tracking-[-.045em]">APIs, integrations and platform tools live in Developers.</h2>
            <p className="mt-3 max-w-3xl text-[11px] leading-6 text-[#6F685F]">Business teams stay focused on products and outcomes. Developers get a separate technical surface for APIs, integrations and platform tooling.</p>
          </div>
          <a href="/developers" className="text-[10px] font-semibold text-[#815B36]">Explore Developers</a>
        </div>
      </section>

      <section className="bg-[#EEE6DB] text-[#1D1B18]">
        <div className="mx-auto grid max-w-[1320px] gap-8 px-5 py-20 sm:px-7 lg:grid-cols-[1fr_auto] lg:items-center lg:px-10 lg:py-24">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A744B]">BUILD YOUR AVANTIQO</p>
            <h2 className="mt-4 max-w-4xl text-[44px] font-medium leading-[.98] tracking-[-.055em] sm:text-[60px]">Start with what matters now. Expand from there.</h2>
            <p className="mt-5 max-w-3xl text-[13px] leading-7 text-[#6D645B]">Choose the product that solves the current problem. Add connected products when they create the next piece of value.</p>
          </div>
          <a href="/start" className="inline-flex h-11 items-center rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white">Talk to Avantiqo</a>
        </div>
      </section>
    </main>
  );
}
