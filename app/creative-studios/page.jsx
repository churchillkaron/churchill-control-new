import PublicSiteHeader from "@/components/public/PublicSiteHeader";

export const metadata={title:"Creative Studios | Avantiqo",description:"Avantiqo Creative Studios: complete production systems for image, video and music."};
const studios=[
  ["Image Studio","From concept to campaign.","Research, art direction, image production, critique, repair, typography and final delivery.","/creative-studios/image"],
  ["Video Studio","From story to screen.","Story development, shot design, production, dailies, repair, edit, post-production and mastering.","/creative-studios/video"],
  ["Music Studio","From idea to full production.","Composition, arrangement, edit, remix, stems, vocal work, SFX, mix and master.","/creative-studios/music"],
];
const process=[["01","Brief"],["02","Research"],["03","Direction"],["04","Creation"],["05","Review"],["06","Repair"],["07","Delivery"]];
function Arrow({className=""}){return <svg viewBox="0 0 20 20" className={className} fill="none"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
function Core(){return <div className="relative mx-auto min-h-[580px] w-full overflow-hidden rounded-[30px] border border-black/[0.08] bg-[#EEE8DE] shadow-[0_42px_120px_rgba(73,50,24,.18)]">
  <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:'url(/art/creative-image.jpg)'}}/>
  <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(247,246,243,.14),transparent_34%,rgba(0,0,0,.1)),linear-gradient(180deg,transparent_48%,rgba(12,10,8,.72))]"/>
  <div className="absolute left-5 top-5 rounded-full border border-white/35 bg-white/70 px-3 py-1.5 text-[8px] font-semibold uppercase tracking-[0.2em] text-[#6E4D2D] shadow-sm backdrop-blur-xl">CREATIVE INTELLIGENCE / REAL PRODUCTION</div>
  <div className="absolute right-5 top-5 hidden rounded-[18px] border border-white/30 bg-black/28 p-3 text-white backdrop-blur-xl sm:block"><div className="text-[7px] uppercase tracking-[0.2em] text-[#E8C18D]">One system</div><div className="mt-1 text-[9px] text-white/70">Image · Video · Music</div></div>
  <div className="absolute inset-x-5 bottom-5 flex items-end justify-between gap-4 border-t border-white/20 pt-4"><div><div className="text-[8px] font-semibold uppercase tracking-[0.22em] text-[#E9C28C]">Ideas into impact</div><div className="mt-1 text-[10px] text-white/68">Human direction. Professional production. Avantiqo intelligence.</div></div><div className="hidden text-right text-[8px] uppercase tracking-[0.18em] text-white/46 sm:block">Research · Create · Review · Deliver</div></div>
</div>}

function ProductionFlow(){return <div className="relative mt-12 overflow-hidden rounded-[30px] border border-black/[0.07] bg-white p-5 shadow-[0_24px_70px_rgba(53,42,28,.05)] sm:p-7 lg:p-9">
  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_50%,rgba(214,166,106,.09),transparent_24%),radial-gradient(circle_at_88%_50%,rgba(154,116,75,.07),transparent_22%)]"/>
  <div className="relative hidden h-px bg-black/[0.08] lg:block"><div className="absolute inset-y-[-1px] left-0 w-[84%] bg-gradient-to-r from-[#D6A66A]/15 via-[#A37849]/65 to-[#D6A66A]/18"/></div>
  <div className="relative grid grid-cols-2 gap-3 lg:grid-cols-7 lg:gap-0">{process.map(([n,t],i)=><div key={t} className="relative lg:px-3 lg:pt-8">
    <div className="absolute left-0 top-[-6px] hidden h-3 w-3 rounded-full border border-[#A37849]/50 bg-[#F7F6F3] shadow-[0_0_0_5px_rgba(214,166,106,.07)] lg:block"/>
    <div className={`min-h-[132px] rounded-[20px] border p-4 transition ${i===3?'border-[#D6A66A]/35 bg-[#FBF5EC] shadow-[0_12px_34px_rgba(154,116,75,.08)]':'border-black/[0.065] bg-[#FCFBF9]'}`}>
      <div className="flex items-center justify-between"><span className="text-[8px] font-bold text-[#A37849]">{n}</span><span className="h-1.5 w-1.5 rounded-full bg-[#D6A66A]/65"/></div>
      <div className="mt-9 text-[13px] font-semibold text-[#2C2925]">{t}</div>
      <div className="mt-2 text-[8px] leading-4 text-[#8A847B]">{['Define the objective','Understand the world','Choose the creative language','Produce the work','Challenge every detail','Fix only what failed','Master every output'][i]}</div>
    </div>
  </div>)}</div>
  <div className="relative mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-black/[0.06] pt-5"><div className="text-[9px] uppercase tracking-[0.17em] text-[#9A744B]">Direction stays connected to every output</div><div className="text-[9px] text-[#8A847B]">Approved work remains locked while failed details return for repair.</div></div>
</div>}

function IntelligenceMap(){const items=[['Image Studio','Campaign systems','left-[6%] top-[18%]'],['Video Studio','Stories / shots / masters','right-[6%] top-[18%]'],['Music Studio','Composition / mix / master','left-1/2 bottom-[10%] -translate-x-1/2']];return <div className="relative min-h-[470px] overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#0A0908] shadow-[0_34px_90px_rgba(0,0,0,.26)]">
  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_47%,rgba(214,166,106,.18),transparent_20%),radial-gradient(circle_at_50%_50%,rgba(214,166,106,.05),transparent_50%)]"/>
  <div className="absolute left-1/2 top-1/2 h-[270px] w-[270px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#D6A66A]/12"/><div className="absolute left-1/2 top-1/2 h-[180px] w-[180px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#D6A66A]/18"/>
  <div className="absolute left-1/2 top-1/2 z-10 flex h-[112px] w-[112px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#D6A66A]/38 bg-[radial-gradient(circle,rgba(214,166,106,.23),rgba(26,20,14,.78)_62%)] shadow-[0_0_70px_rgba(214,166,106,.16)]"><div className="text-center"><div className="text-[8px] font-semibold uppercase tracking-[0.22em] text-[#E3BC86]">Avantiqo</div><div className="mt-1 text-[7px] uppercase tracking-[0.18em] text-white/34">Intelligence</div></div></div>
  <svg aria-hidden="true" className="absolute inset-0 h-full w-full text-[#D6A66A]" viewBox="0 0 1000 470" preserveAspectRatio="none"><path d="M180 135 C330 135 350 235 500 235" stroke="currentColor" strokeOpacity=".20" strokeWidth="1" fill="none"/><path d="M820 135 C670 135 650 235 500 235" stroke="currentColor" strokeOpacity=".20" strokeWidth="1" fill="none"/><path d="M500 380 C500 330 500 285 500 235" stroke="currentColor" strokeOpacity=".20" strokeWidth="1" fill="none"/></svg>
  {items.map(([name,detail,pos],i)=><div key={name} className={`absolute ${pos} w-[210px] rounded-[18px] border border-white/[0.08] bg-white/[0.025] p-4 backdrop-blur-sm`}><div className="flex items-center justify-between"><span className="text-[8px] font-bold text-[#D6A66A]">0{i+1}</span><span className="h-1.5 w-1.5 rounded-full bg-[#D6A66A]/70 shadow-[0_0_10px_rgba(214,166,106,.5)]"/></div><div className="mt-5 text-[13px] font-semibold text-white/82">{name}</div><div className="mt-1 text-[8px] text-white/30">{detail}</div></div>)}
  <div className="absolute inset-x-6 bottom-5 flex justify-between border-t border-white/[0.07] pt-4 text-[7px] uppercase tracking-[0.16em] text-white/22"><span>Shared brief</span><span>Shared research</span><span>Shared governance</span><span>Shared quality</span></div>
</div>}

export default function Page(){return <main className="min-h-screen bg-[#F7F6F3] text-[#191919]">
<PublicSiteHeader
  context="Creative Studios"
  links={[
    { label: "Studios", href: "#studios", visibility: "hidden md:inline-flex" },
    { label: "Developers", href: "/developers", visibility: "hidden lg:inline-flex" },
    { label: "Platform", href: "/", visibility: "hidden xl:inline-flex" },
  ]}
/>
<section className="border-b border-black/[0.06]"><div className="mx-auto grid max-w-[1460px] gap-12 px-5 py-16 sm:px-7 lg:grid-cols-[.88fr_1.12fr] lg:items-center lg:px-10 lg:py-24"><div className="max-w-[690px]"><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">Avantiqo Creative Studios</p><h1 className="mt-5 text-[50px] font-medium leading-[.97] tracking-[-0.06em] text-[#181817] sm:text-[64px] lg:text-[76px]">From imagination to real-world impact.</h1><p className="mt-7 max-w-xl text-[17px] leading-8 text-[#625F59]">Three professional creative production systems for image, video and music. Avantiqo carries the work from brief and research through direction, production, review, repair and final delivery.</p><div className="mt-8 flex flex-wrap gap-2.5"><a href="#studios" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171716] px-5 text-[11px] font-semibold text-white">Explore the studios <Arrow className="h-3.5 w-3.5"/></a><a href="#process" className="inline-flex h-11 items-center rounded-xl border border-black/[0.09] bg-white px-5 text-[11px] font-semibold text-[#56514A]">See production flow</a></div></div><div className="relative overflow-hidden rounded-[34px] border border-black/[0.07] bg-white p-2 shadow-[0_34px_95px_rgba(73,50,24,.12)] sm:p-3"><div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_18%,rgba(214,166,106,.10),transparent_30%)]"/><Core/></div></div></section>
<section id="studios" className="border-b border-black/[0.06] bg-[#FBFAF8]">
  <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">Three studios. One creative system.</p>
    <h2 className="mt-3 max-w-3xl text-[38px] font-medium leading-[1.04] tracking-[-0.045em] sm:text-[48px]">Choose the medium. Keep the intelligence.</h2>
    <div className="mt-12 grid gap-5 lg:grid-cols-3">
      {studios.map(([name,title,text,href],i)=><a key={name} href={href} className="group overflow-hidden rounded-[30px] border border-black/[0.075] bg-white shadow-[0_14px_45px_rgba(53,39,24,.045)] transition duration-500 hover:-translate-y-1.5 hover:border-[#D6A66A]/25 hover:shadow-[0_28px_70px_rgba(53,39,24,.13)]">
        <div className="relative h-[290px] overflow-hidden bg-[#17120d]">
          <div className="absolute inset-0 bg-cover bg-center transition duration-700 group-hover:scale-[1.035]" style={{backgroundImage:`url(${[
            '/art/creative-image.jpg',
            '/art/creative-video.jpg',
            '/art/creative-music.jpg'
          ][i]})`}}/>
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.08)_45%,rgba(8,7,6,.78))]"/>
          <div className="absolute left-5 top-5 rounded-full border border-white/20 bg-black/24 px-3 py-1.5 text-[8px] font-bold uppercase tracking-[0.18em] text-[#F0D3A8] backdrop-blur-xl">0{i+1} · {name}</div>
          <div className="absolute bottom-5 left-5 max-w-[72%]"><div className="text-[8px] uppercase tracking-[0.18em] text-[#E8C18D]">{i===0?'Art direction · campaigns':i===1?'Story · camera · post':'Composition · record · master'}</div><div className="mt-1 text-[11px] text-white/72">{i===0?'Real visual production':i===1?'Cinematic production':'Professional audio production'}</div></div>
          <div className="absolute bottom-5 right-5 flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/30 text-white backdrop-blur-md transition duration-500 group-hover:translate-x-1 group-hover:border-[#E4B97C]/70 group-hover:text-[#F0C88F]"><Arrow className="h-4 w-4"/></div>
        </div>
        <div className="p-6 sm:p-7"><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#9A744B]">{name}</p><h3 className="mt-2 text-[25px] font-medium tracking-[-0.035em]">{title}</h3><p className="mt-4 text-[11px] leading-6 text-[#77716A]">{text}</p></div>
      </a>)}
    </div>
  </div>
</section>
<section id="process" className="border-b border-black/[0.06] bg-[#F7F6F3]"><div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">More than generation</p><h2 className="mt-3 max-w-3xl text-[38px] font-medium leading-[1.03] tracking-[-0.045em] sm:text-[48px]">A creative system that remembers the direction.</h2><p className="mt-5 max-w-2xl text-[13px] leading-6 text-[#77716A]">The work moves forward without losing the original objective. Each stage adds evidence, decisions and quality rather than resetting the mission.</p><ProductionFlow/></div></section>
<section className="border-b border-white/[0.06] bg-[#171716] text-white"><div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24"><div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">The Intelligence Core</p><h2 className="mt-3 max-w-xl text-[38px] font-medium leading-[1.03] tracking-[-0.045em] text-[#F7F4EF] sm:text-[48px]">One objective. Three creative disciplines.</h2></div><p className="max-w-xl text-[14px] leading-7 text-white/45 lg:justify-self-end">Image, video and music can work independently or orbit the same brief, research, direction, governance and quality logic—without collapsing into one generic tool.</p></div><div className="mt-10"><IntelligenceMap/></div></div></section>
<section className="bg-[#F7F6F3]"><div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24"><div className="relative overflow-hidden rounded-[34px] border border-black/[0.08] bg-[#12110f] px-6 py-16 text-center text-white shadow-[0_28px_90px_rgba(46,34,23,.12)] sm:px-10 lg:py-20"><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_110%,rgba(214,166,106,.26),transparent_36%),radial-gradient(circle_at_10%_0%,rgba(214,166,106,.07),transparent_26%)]"/><div className="absolute left-[8%] top-1/2 h-px w-[18%] bg-gradient-to-r from-transparent to-[#D6A66A]/40"/><div className="absolute right-[8%] top-1/2 h-px w-[18%] bg-gradient-to-l from-transparent to-[#D6A66A]/40"/><div className="relative"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">Creative production for real business</p><h2 className="mx-auto mt-4 max-w-4xl text-[40px] font-medium leading-[1.02] tracking-[-0.05em] text-[#F7F4EF] sm:text-[52px]">Give the Studio the objective. Let the production system do the work.</h2><p className="mx-auto mt-5 max-w-2xl text-[12px] leading-6 text-white/38">One mission can become a campaign system, a film, a soundtrack—or all three with the same creative intent.</p><div className="mt-8 flex flex-wrap justify-center gap-2.5"><a href="/login" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#F7F4EF] px-5 text-[11px] font-semibold text-[#171716]">Enter Avantiqo <Arrow className="h-3.5 w-3.5"/></a><a href="/developers" className="inline-flex h-11 items-center rounded-xl border border-white/[0.12] bg-white/[0.03] px-5 text-[11px] font-semibold text-white/72">Developer access</a></div></div></div></div></section>
</main>}
