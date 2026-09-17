import PublicSiteHeader from "@/components/public/PublicSiteHeader";

function Arrow({ className = "" }) {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ComputeArt() {
  return <div className="relative h-full min-h-[520px] overflow-hidden rounded-[30px] border border-white/[0.09] bg-[#090908] shadow-[0_40px_110px_rgba(25,18,10,.28)]">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_26%,rgba(214,166,106,.2),transparent_28%),linear-gradient(145deg,#15110d,#070706_72%)]" />
    <div className="absolute left-6 top-6 text-[8px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">AVANTIQO COMPUTE FABRIC</div>
    <div className="absolute inset-x-[9%] top-[16%] grid grid-cols-3 gap-3">{["AVANTIQO","PAID JOBS","IDLE RENTAL"].map((x,i)=><div key={x} className={`rounded-[18px] border p-4 ${i===0?'border-[#D6A66A]/35 bg-[#D6A66A]/[0.07]':'border-white/[0.08] bg-white/[0.025]'}`}><div className="text-[7px] uppercase tracking-[0.18em] text-white/28">0{i+1}</div><div className="mt-10 text-[11px] font-semibold text-white/72">{x}</div><div className="mt-3 h-1 rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-[#D6A66A]/65" style={{width:`${88-i*19}%`}}/></div></div>)}</div>
    <div className="absolute inset-x-[9%] bottom-[18%] rounded-[22px] border border-white/[0.08] bg-black/20 p-5"><div className="grid grid-cols-4 gap-2">{[82,73,64,49,88,41,58,76].map((v,i)=><div key={i} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><div className="flex items-center justify-between text-[7px] text-white/28"><span>GPU {String(i+1).padStart(2,'0')}</span><span>{v}%</span></div><div className="mt-3 h-1 rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-[#D6A66A]/60" style={{width:`${v}%`}}/></div></div>)}</div></div>
    <div className="absolute inset-x-6 bottom-6 flex justify-between border-t border-white/[0.09] pt-4 text-[7px] uppercase tracking-[0.18em] text-white/25"><span>Own workloads first</span><span>Unused capacity can earn</span></div>
  </div>;
}

function MarketplaceArt() {
  const nodes=[[16,24],[76,20],[12,66],[79,69],[47,43]];
  return <div className="relative h-full min-h-[520px] overflow-hidden rounded-[30px] border border-white/[0.09] bg-[#0a0908] shadow-[0_40px_110px_rgba(25,18,10,.28)]"><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,rgba(214,166,106,.2),transparent_24%),linear-gradient(145deg,#15110d,#070706_72%)]"/><div className="absolute left-6 top-6 text-[8px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">AVANTIQO MARKETPLACE</div>{nodes.map(([x,y],i)=><div key={i} className={`absolute rounded-[18px] border ${i===4?'h-32 w-32 border-[#D6A66A]/40 bg-[#D6A66A]/[0.08]':'h-24 w-36 border-white/[0.08] bg-white/[0.025]'}`} style={{left:`${x}%`,top:`${y}%`,transform:'translate(-50%,-50%)'}}><div className="p-3 text-[7px] uppercase tracking-[0.16em] text-white/28">{i===0?'APP':i===1?'AGENT':i===2?'SOLUTION':i===3?'GPU':'AVANTIQO'}</div></div>)}<svg className="absolute inset-0 h-full w-full" aria-hidden="true"><g stroke="rgba(214,166,106,.2)" strokeWidth="1">{nodes.slice(0,4).map(([x,y],i)=><line key={i} x1={`${x}%`} y1={`${y}%`} x2="47%" y2="43%" />)}</g></svg><div className="absolute inset-x-6 bottom-6 flex justify-between border-t border-white/[0.09] pt-4 text-[7px] uppercase tracking-[0.18em] text-white/25"><span>Publish</span><span>Meter</span><span>Settle</span><span>Scale</span></div></div>;
}

function NetworkArt({ kind }) {
  const labelSets = {
    solutions:["RESTAURANTS","HOTELS","RETAIL","CONSTRUCTION","AGENCIES","ACCOUNTING"],
    integrations:["MESSAGING","SOCIAL","PAYMENTS","DOCUMENTS","ADS","DATA"],
    partners:["ACCOUNTANTS","AGENCIES","CONSULTANTS","IMPLEMENTERS","RESELLERS","BUILDERS"],
    agents:["RESEARCH","PREPARE","REVIEW","EXECUTE","VERIFY","LEARN"],
    enterprise:["ENTITIES","LOCATIONS","GOVERNANCE","PORTFOLIO","INTEGRATIONS","SUPPORT"],
    services:["DISCOVER","MIGRATE","CONFIGURE","INTEGRATE","LAUNCH","OPTIMIZE"],
    insights:["FORECAST","EXCEPTIONS","PORTFOLIO","FINANCE","COMMERCIAL","OPERATIONS"],
  };
  const labels = labelSets[kind] || labelSets.agents;
  return <div className="relative h-full min-h-[520px] overflow-hidden rounded-[30px] border border-white/[0.09] bg-[#0a0908] shadow-[0_40px_110px_rgba(25,18,10,.28)]"><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,rgba(214,166,106,.22),transparent_23%),linear-gradient(145deg,#15110d,#070706_72%)]"/><div className="absolute left-1/2 top-1/2 z-10 flex h-36 w-36 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#D6A66A]/45 bg-[#D6A66A]/[0.06] text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-[#E0B97D]">AVANTIQO<br/>{kind.toUpperCase()}</div>{labels.map((x,i)=>{const a=(i/labels.length)*Math.PI*2-Math.PI/2;const left=50+Math.cos(a)*35;const top=50+Math.sin(a)*34;return <div key={x} className="absolute z-10 w-32 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/[0.08] bg-black/35 px-3 py-3 text-center text-[7px] font-semibold uppercase tracking-[0.14em] text-white/42" style={{left:`${left}%`,top:`${top}%`}}>{x}</div>})}<svg className="absolute inset-0 h-full w-full" aria-hidden="true"><g stroke="rgba(214,166,106,.17)" strokeWidth="1">{labels.map((_,i)=>{const a=(i/labels.length)*Math.PI*2-Math.PI/2;return <line key={i} x1="50%" y1="50%" x2={`${50+Math.cos(a)*35}%`} y2={`${50+Math.sin(a)*34}%`}/>})}</g></svg></div>;
}

function PricingArt() {
  const rows=[["BUSINESS OS","SUBSCRIPTION",82],["WALLET","USAGE",66],["DEVELOPER","API",53],["COMPUTE","CAPACITY",71],["MARKETPLACE","COMMISSION",44]];
  return <div className="relative h-full min-h-[520px] overflow-hidden rounded-[30px] border border-white/[0.09] bg-[#090908] shadow-[0_40px_110px_rgba(25,18,10,.28)]"><div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_24%,rgba(214,166,106,.18),transparent_30%),linear-gradient(145deg,#15110d,#070706_72%)]"/><div className="absolute left-6 top-6 text-[8px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">COMMERCIAL ENGINE</div><div className="absolute inset-x-[10%] top-[19%] space-y-3">{rows.map(([a,b,v],i)=><div key={a} className="grid grid-cols-[1fr_auto] gap-4 rounded-[16px] border border-white/[0.08] bg-white/[0.025] p-4"><div><div className="text-[8px] font-semibold text-white/65">{a}</div><div className="mt-1 text-[7px] uppercase tracking-[0.16em] text-white/24">{b}</div></div><div className="flex w-36 items-center gap-2"><div className="h-1 flex-1 rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-[#D6A66A]/65" style={{width:`${v}%`}}/></div><span className="text-[7px] text-[#D6A66A]/60">0{i+1}</span></div></div>)}</div></div>;
}


function CommerceArt() {
  const steps = [
    ["ORDER", "12,480", "01"],
    ["PAYMENT", "QR / CARD", "02"],
    ["SETTLEMENT", "MATCHED", "03"],
    ["FINANCE", "POSTED", "04"],
  ];
  return <div className="relative h-full min-h-[520px] overflow-hidden rounded-[30px] border border-white/[0.09] bg-[#090908] shadow-[0_40px_110px_rgba(25,18,10,.28)]">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_28%,rgba(214,166,106,.22),transparent_27%),linear-gradient(145deg,#15110d,#070706_72%)]" />
    <div className="absolute left-6 top-6 text-[8px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">AVANTIQO COMMERCE FLOW</div>
    <div className="absolute inset-x-[8%] top-[19%] grid gap-3 sm:grid-cols-2">{steps.map(([a,b,n],i)=><div key={a} className={`rounded-[18px] border p-4 ${i===1?'border-[#D6A66A]/40 bg-[#D6A66A]/[0.075]':'border-white/[0.08] bg-white/[0.025]'}`}><div className="flex items-center justify-between text-[7px] uppercase tracking-[0.16em] text-white/28"><span>{n}</span><span>{i<3?'FLOW':'LEDGER'}</span></div><div className="mt-8 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/38">{a}</div><div className="mt-2 text-[18px] font-medium tracking-[-0.03em] text-white/78">{b}</div></div>)}</div>
    <div className="absolute inset-x-[8%] bottom-[13%] flex items-center gap-2"><span className="h-px flex-1 bg-white/[0.08]"/><span className="rounded-full border border-[#D6A66A]/30 bg-[#D6A66A]/[0.07] px-3 py-1.5 text-[7px] uppercase tracking-[0.16em] text-[#D6A66A]">customer → settlement → finance</span><span className="h-px flex-1 bg-white/[0.08]"/></div>
  </div>;
}

function ChannelsArt() {
  const cards = [
    ["WEB", "Public website", "left-[7%] top-[19%]"],
    ["PORTAL", "Customer portal", "right-[7%] top-[16%]"],
    ["MOBILE", "Staff mobile", "left-[12%] bottom-[15%]"],
    ["POS", "Kiosk / POS", "right-[10%] bottom-[17%]"],
  ];
  return <div className="relative h-full min-h-[520px] overflow-hidden rounded-[30px] border border-white/[0.09] bg-[#090908] shadow-[0_40px_110px_rgba(25,18,10,.28)]">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,rgba(214,166,106,.22),transparent_24%),linear-gradient(145deg,#15110d,#070706_72%)]" />
    <div className="absolute left-6 top-6 text-[8px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">AVANTIQO CHANNEL FABRIC</div>
    <div className="absolute left-1/2 top-1/2 z-20 flex h-32 w-32 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#D6A66A]/45 bg-[#D6A66A]/[0.07] text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-[#E0B97D]">ONE<br/>BUSINESS<br/>CONTEXT</div>
    {cards.map(([k,l,pos])=><div key={k} className={`absolute z-10 w-[34%] rounded-[18px] border border-white/[0.08] bg-white/[0.025] p-4 ${pos}`}><div className="text-[7px] uppercase tracking-[0.16em] text-white/26">{k}</div><div className="mt-9 text-[12px] font-semibold text-white/72">{l}</div><div className="mt-3 h-px bg-gradient-to-r from-[#D6A66A]/55 to-transparent"/></div>)}
    <svg className="absolute inset-0 h-full w-full" aria-hidden="true"><g stroke="rgba(214,166,106,.16)" strokeWidth="1"><line x1="23%" y1="30%" x2="50%" y2="50%"/><line x1="77%" y1="29%" x2="50%" y2="50%"/><line x1="27%" y1="72%" x2="50%" y2="50%"/><line x1="75%" y1="71%" x2="50%" y2="50%"/></g></svg>
  </div>;
}

const ART = { compute:<ComputeArt/>, marketplace:<MarketplaceArt/>, solutions:<NetworkArt kind="solutions"/>, integrations:<NetworkArt kind="integrations"/>, partners:<NetworkArt kind="partners"/>, agents:<NetworkArt kind="agents"/>, enterprise:<NetworkArt kind="enterprise"/>, services:<NetworkArt kind="services"/>, insights:<NetworkArt kind="insights"/>, pricing:<PricingArt/>, commerce:<CommerceArt/>, channels:<ChannelsArt/> };

export default function CommercialSurfacePage({config}) {
  return <main className="min-h-screen bg-[#F7F6F3] text-[#191919]">
    <PublicSiteHeader context={config.context} links={[{label:"Solutions",href:"/solutions",visibility:"hidden lg:inline-flex"},{label:"Commerce",href:"/commerce",visibility:"hidden lg:inline-flex"},{label:"Channels",href:"/channels",visibility:"hidden xl:inline-flex"},{label:"Developers",href:"/developers",visibility:"hidden xl:inline-flex"}]} />
    <section className="relative overflow-hidden border-b border-black/[0.06]"><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_8%,rgba(214,166,106,.12),transparent_34%)]"/><div className="relative mx-auto grid max-w-[1460px] gap-12 px-5 py-16 sm:px-7 lg:grid-cols-[.86fr_1.14fr] lg:items-center lg:px-10 lg:py-24"><div className="max-w-[680px]"><div className="inline-flex rounded-full border border-[#D6A66A]/25 bg-[#D6A66A]/[0.07] px-3 py-1.5 text-[8px] font-semibold uppercase tracking-[0.18em] text-[#8A633C]">{config.status}</div><p className="mt-7 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">{config.eyebrow}</p><h1 className="mt-4 text-[48px] font-medium leading-[.98] tracking-[-0.06em] sm:text-[62px] lg:text-[72px]">{config.title}</h1><p className="mt-6 max-w-xl text-[16px] leading-8 text-[#625F59]">{config.description}</p><div className="mt-8 flex flex-wrap gap-2.5"><a href={config.primaryHref || "/login"} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171716] px-5 text-[11px] font-semibold text-white">{config.primary || "Enter Avantiqo"}<Arrow className="h-3.5 w-3.5"/></a><a href="/pricing" className="inline-flex h-11 items-center rounded-xl border border-black/[0.09] bg-white px-5 text-[11px] font-semibold text-[#56514A]">Commercial model</a></div></div>{ART[config.art]}</div></section>
    <section className="border-b border-black/[0.06] bg-[#FBFAF8]"><div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">{config.valueEyebrow}</p><h2 className="mt-3 max-w-4xl text-[36px] font-medium leading-[1.04] tracking-[-0.045em] sm:text-[48px]">{config.valueTitle}</h2><div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{config.value.map(([t,d],i)=><article key={t} className="rounded-[22px] border border-black/[0.075] bg-white p-5 shadow-[0_10px_35px_rgba(40,30,20,.035)]"><div className="text-[8px] font-bold text-[#A37849]">0{i+1}</div><h3 className="mt-7 text-[15px] font-semibold text-[#302D29]">{t}</h3><p className="mt-2 text-[10px] leading-5 text-[#7A756E]">{d}</p></article>)}</div></div></section>
    <section className="border-b border-white/[0.06] bg-[#171716] text-white"><div className="mx-auto grid max-w-[1320px] gap-12 px-5 py-20 sm:px-7 lg:grid-cols-[.72fr_1.28fr] lg:px-10 lg:py-24"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">Revenue architecture</p><h2 className="mt-3 text-[36px] font-medium leading-[1.04] tracking-[-0.045em] text-[#F7F4EF] sm:text-[48px]">{config.moneyTitle}</h2><p className="mt-5 max-w-lg text-[13px] leading-7 text-white/42">{config.moneyDescription}</p></div><div className="grid gap-3 sm:grid-cols-2">{config.money.map(([t,d],i)=><div key={t} className="rounded-[20px] border border-white/[0.08] bg-white/[0.025] p-5"><div className="text-[8px] font-bold text-[#D6A66A]">0{i+1}</div><div className="mt-6 text-[14px] font-semibold text-white/78">{t}</div><div className="mt-2 text-[9px] leading-5 text-white/34">{d}</div></div>)}</div></div></section>
    <section className="bg-[#F7F6F3]"><div className="mx-auto max-w-[1120px] px-5 py-20 text-center sm:px-7 lg:px-10 lg:py-24"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">Part of the Avantiqo economy</p><h2 className="mx-auto mt-4 max-w-4xl text-[38px] font-medium leading-[1.02] tracking-[-0.05em] sm:text-[52px]">{config.cta}</h2><div className="mt-8 flex flex-wrap justify-center gap-2.5"><a href={config.primaryHref || "/login"} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171716] px-5 text-[11px] font-semibold text-white">{config.primary || "Enter Avantiqo"}<Arrow className="h-3.5 w-3.5"/></a><a href="/developers" className="inline-flex h-11 items-center rounded-xl border border-black/[0.09] bg-white px-5 text-[11px] font-semibold text-[#56514A]">Developer platform</a></div></div></section>
  </main>;
}
