import Image from "next/image";
import PublicSiteHeader from "@/components/public/PublicSiteHeader";

export const metadata={title:"Creative Studios | Avantiqo",description:"Avantiqo Creative Studios: complete production systems for image, video and music."};
const studios=[
  ["Image Studio","From concept to campaign.","Research, art direction, image production, critique, repair, typography and final delivery.","/creative-studios/image"],
  ["Video Studio","From story to screen.","Story development, shot design, production, dailies, repair, edit, post-production and mastering.","/creative-studios/video"],
  ["Music Studio","From idea to full production.","Composition, arrangement, edit, remix, stems, vocal work, SFX, mix and master.","/creative-studios/music"],
];
const process=[["01","Brief"],["02","Research"],["03","Direction"],["04","Creation"],["05","Review"],["06","Repair"],["07","Delivery"]];
function Arrow({className=""}){return <svg viewBox="0 0 20 20" className={className} fill="none"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
function Core(){return <div className="relative mx-auto min-h-[580px] w-full overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#090908] shadow-[0_42px_120px_rgba(35,22,10,.28)]"><Image src="/branding/avantiqo-intelligence-core-hero.webp" alt="Avantiqo Intelligence Core" fill sizes="(max-width: 1024px) 100vw, 54vw" className="object-cover object-center" priority/><div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.08),transparent_55%,rgba(0,0,0,.78))]"/><div className="absolute left-5 top-5 rounded-full border border-[#D6A66A]/25 bg-black/45 px-3 py-1.5 text-[8px] font-semibold uppercase tracking-[0.2em] text-[#E5C08A] backdrop-blur-xl">AVANTIQO INTELLIGENCE CORE</div><div className="absolute inset-x-5 bottom-5 border-t border-white/[0.1] pt-4"><div className="text-[8px] font-semibold uppercase tracking-[0.22em] text-[#D6A66A]">People / ideas / possibilities</div><div className="mt-1 text-[10px] text-white/45">One intelligence layer. Three world-class production disciplines.</div></div></div>}

export default function Page(){return <main className="min-h-screen bg-[#F7F6F3] text-[#191919]">
<PublicSiteHeader
  context="Creative Studios"
  links={[
    { label: "Studios", href: "#studios", visibility: "hidden md:inline-flex" },
    { label: "Developers", href: "/developers", visibility: "hidden lg:inline-flex" },
    { label: "Platform", href: "/", visibility: "hidden xl:inline-flex" },
  ]}
/>
<section className="border-b border-black/[0.06]"><div className="mx-auto grid max-w-[1460px] gap-12 px-5 py-16 sm:px-7 lg:grid-cols-[.88fr_1.12fr] lg:items-center lg:px-10 lg:py-24"><div className="max-w-[690px]"><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">Avantiqo Creative Studios</p><h1 className="mt-5 text-[50px] font-medium leading-[.97] tracking-[-0.06em] text-[#181817] sm:text-[64px] lg:text-[76px]">From imagination to real-world impact.</h1><p className="mt-7 max-w-xl text-[17px] leading-8 text-[#625F59]">Three professional creative production systems for image, video and music. Avantiqo carries the work from brief and research through direction, production, review, repair and final delivery.</p><div className="mt-8 flex flex-wrap gap-2.5"><a href="#studios" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171716] px-5 text-[11px] font-semibold text-white">Explore the studios <Arrow className="h-3.5 w-3.5"/></a><a href="#process" className="inline-flex h-11 items-center rounded-xl border border-black/[0.09] bg-white px-5 text-[11px] font-semibold text-[#56514A]">See production flow</a></div></div><div className="relative overflow-hidden rounded-[34px] border border-black/[0.08] bg-[#171716] p-7 shadow-[0_34px_95px_rgba(37,31,24,.16)] sm:p-10"><div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_18%,rgba(214,166,106,.18),transparent_30%)]"/><Core/></div></div></section>
<section id="studios" className="border-b border-black/[0.06] bg-[#FBFAF8]">
  <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">Three studios. One creative system.</p>
    <h2 className="mt-3 max-w-3xl text-[38px] font-medium leading-[1.04] tracking-[-0.045em] sm:text-[48px]">Choose the medium. Keep the intelligence.</h2>
    <div className="mt-12 grid gap-5 lg:grid-cols-3">
      {studios.map(([name,title,text,href],i)=><a key={name} href={href} className="group overflow-hidden rounded-[30px] border border-black/[0.075] bg-white shadow-[0_14px_45px_rgba(53,39,24,.045)] transition duration-500 hover:-translate-y-1.5 hover:border-[#D6A66A]/25 hover:shadow-[0_28px_70px_rgba(53,39,24,.13)]">
        <div className="relative h-[290px] overflow-hidden bg-[#0A0908]">
          {i===0 ? <>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_66%_30%,rgba(226,182,117,.24),transparent_20%),radial-gradient(circle_at_28%_74%,rgba(128,85,45,.2),transparent_30%),linear-gradient(145deg,#19130e_0%,#0b0a08_54%,#050505_100%)]"/>
            <div className="absolute left-[9%] top-[10%] h-[79%] w-[82%] rounded-[24px] border border-white/[0.07] bg-white/[0.018] shadow-[inset_0_0_70px_rgba(255,255,255,.018)]"/>
            <div className="absolute left-[18%] top-[20%] h-[61%] w-[39%] overflow-hidden rounded-[20px] border border-[#D6A66A]/25 bg-[#120f0c] shadow-[0_24px_55px_rgba(0,0,0,.36)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_58%_42%,rgba(235,192,125,.58),transparent_22%),radial-gradient(circle_at_44%_54%,rgba(134,88,46,.5),transparent_40%),linear-gradient(155deg,#1d1711,#080706_78%)]"/>
              <div className="absolute left-4 top-4 text-[7px] font-semibold uppercase tracking-[0.24em] text-white/36">Campaign / 01</div>
              <div className="absolute bottom-5 left-4 right-4">
                <div className="h-[2px] w-10 bg-[#D6A66A]/80"/>
                <div className="mt-3 text-[18px] font-medium leading-none tracking-[-0.05em] text-[#F6EFE5]">Create<br/>desire.</div>
              </div>
            </div>
            <div className="absolute right-[13%] top-[18%] h-[53%] w-[34%] rotate-[5deg] rounded-[18px] border border-white/[0.08] bg-[linear-gradient(155deg,rgba(255,255,255,.06),rgba(255,255,255,.01))] backdrop-blur-[2px]">
              <div className="absolute inset-x-5 top-6 h-px bg-white/[0.09]"/>
              <div className="absolute right-5 top-9 text-[30px] font-light tracking-[-0.06em] text-white/16">A/01</div>
              <div className="absolute bottom-6 left-5 right-5 space-y-2"><div className="h-1.5 w-4/5 bg-white/15"/><div className="h-1 w-3/5 bg-[#D6A66A]/30"/><div className="h-px w-full bg-white/[0.07]"/></div>
            </div>
            <div className="absolute left-[14%] top-[16%] h-8 w-8 border-l border-t border-[#D6A66A]/38"/><div className="absolute bottom-[13%] right-[10%] h-8 w-8 border-b border-r border-[#D6A66A]/38"/>
          </> : i===1 ? <>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_35%,rgba(232,190,124,.42),transparent_20%),radial-gradient(circle_at_45%_68%,rgba(77,54,35,.22),transparent_32%),linear-gradient(160deg,#17130f_0%,#080807_62%,#030303_100%)]"/>
            <div className="absolute inset-x-[9%] top-[12%] h-[64%] overflow-hidden rounded-[23px] border border-white/[0.085] bg-[#080807] shadow-[0_26px_62px_rgba(0,0,0,.45)]">
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.025),transparent_46%,rgba(0,0,0,.44)),radial-gradient(ellipse_at_68%_46%,rgba(240,198,132,.68),transparent_16%),linear-gradient(180deg,#1a1611_0%,#0c0b09_52%,#050505_53%,#0b0907_100%)]"/>
              <div className="absolute left-[8%] right-[8%] top-[16%] bottom-[16%] border border-white/[0.08]"/>
              <div className="absolute left-[12%] top-[20%] bottom-[20%] w-px bg-white/[0.055]"/><div className="absolute right-[12%] top-[20%] bottom-[20%] w-px bg-white/[0.055]"/>
              <div className="absolute left-4 top-4 text-[7px] font-semibold uppercase tracking-[0.22em] text-white/34">Shot 024 / Master</div>
              <div className="absolute bottom-4 right-4 rounded-full border border-[#D6A66A]/25 bg-black/30 px-2.5 py-1 text-[7px] tracking-[0.16em] text-[#E1B67D]/75">24 FPS</div>
            </div>
            <div className="absolute bottom-[10%] left-[10%] right-[10%] rounded-[15px] border border-white/[0.07] bg-black/55 p-2 backdrop-blur-md">
              <div className="grid grid-cols-5 gap-1.5">{[0,1,2,3,4].map(n=><div key={n} className={`relative h-9 overflow-hidden rounded-[6px] border ${n===2?'border-[#E2B97D]/65':'border-white/[0.07]'} bg-[#12100d]`}><div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_44%,rgba(214,166,106,.22),transparent_34%)]"/><div className={`absolute bottom-0 left-0 h-[2px] ${n===2?'w-full bg-[#E2B97D]':'w-2/3 bg-white/12'}`}/></div>)}</div>
            </div>
          </> : <>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_32%,rgba(214,166,106,.2),transparent_24%),radial-gradient(circle_at_25%_72%,rgba(94,58,31,.2),transparent_28%),linear-gradient(145deg,#15110e_0%,#080807_58%,#030303_100%)]"/>
            <div className="absolute inset-x-[8%] top-[11%] bottom-[11%] rounded-[24px] border border-white/[0.075] bg-black/20 p-5 shadow-[inset_0_0_60px_rgba(255,255,255,.018)]">
              <div className="flex items-center justify-between"><div className="text-[7px] font-semibold uppercase tracking-[0.22em] text-white/32">Master / 01</div><div className="text-[7px] uppercase tracking-[0.18em] text-[#D6A66A]/65">48 kHz</div></div>
              <div className="mt-7 flex h-[88px] items-center justify-center gap-[3px]">{[18,32,54,73,48,83,62,35,69,91,58,76,42,66,84,52,33,71,47,79,61,39,56,28].map((h,j)=><span key={j} className="w-[3px] rounded-full bg-[linear-gradient(180deg,#E1B67D,rgba(214,166,106,.22))] shadow-[0_0_10px_rgba(214,166,106,.13)]" style={{height:`${h}%`,opacity:.45+(j%5)*.1}}/>)}</div>
              <div className="mt-6 grid grid-cols-4 gap-2">{['VOCAL','MUSIC','SFX','MASTER'].map((x,n)=><div key={x} className="rounded-[9px] border border-white/[0.06] bg-white/[0.018] px-2 py-2.5"><div className="h-8 rounded-[5px] bg-[linear-gradient(180deg,rgba(214,166,106,.22),rgba(255,255,255,.025))] relative overflow-hidden"><div className="absolute inset-x-1 bottom-1 h-px bg-[#D6A66A]/45"/><div className="absolute bottom-1 top-1 w-px bg-white/12" style={{left:`${35+n*14}%`}}/></div><div className="mt-2 text-[6px] tracking-[0.12em] text-white/30">{x}</div></div>)}</div>
            </div>
          </>}
          <div className="absolute left-5 top-5 text-[8px] font-bold uppercase tracking-[0.18em] text-[#D6A66A]">0{i+1}</div>
          <div className="absolute bottom-5 right-5 flex h-10 w-10 items-center justify-center rounded-full border border-[#D6A66A]/35 bg-black/35 text-[#D6A66A] backdrop-blur-md transition duration-500 group-hover:translate-x-1 group-hover:border-[#D6A66A]/60 group-hover:bg-[#D6A66A]/10"><Arrow className="h-4 w-4"/></div>
          <div className="pointer-events-none absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100 bg-[radial-gradient(circle_at_72%_28%,rgba(214,166,106,.08),transparent_34%)]"/>
        </div>
        <div className="p-6 sm:p-7"><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#9A744B]">{name}</p><h3 className="mt-2 text-[25px] font-medium tracking-[-0.035em]">{title}</h3><p className="mt-4 text-[11px] leading-6 text-[#77716A]">{text}</p></div>
      </a>)}
    </div>
  </div>
</section>
<section id="process" className="border-b border-black/[0.06] bg-[#F7F6F3]"><div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">More than generation</p><h2 className="mt-3 text-[38px] font-medium tracking-[-0.045em] sm:text-[48px]">A complete creative production path.</h2><div className="mt-10 grid gap-3 md:grid-cols-2 xl:grid-cols-7">{process.map(([n,t])=><div key={t} className="rounded-[20px] border border-black/[0.075] bg-white p-4"><div className="text-[8px] font-bold text-[#A37849]">{n}</div><div className="mt-8 text-[13px] font-semibold">{t}</div></div>)}</div></div></section>
<section className="border-b border-white/[0.06] bg-[#171716] text-white"><div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-20 sm:px-7 lg:grid-cols-[.8fr_1.2fr] lg:px-10 lg:py-24"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">The Intelligence Core</p><h2 className="mt-3 text-[38px] font-medium leading-[1.04] tracking-[-0.045em] text-[#F7F4EF] sm:text-[48px]">One objective across every medium.</h2><p className="mt-5 text-[14px] leading-7 text-white/48">Image, video and music can operate separately or share the same brief, research, direction, governance and quality logic in one connected mission.</p></div><div className="grid gap-3 sm:grid-cols-3">{["Image Studio","Video Studio","Music Studio"].map((x,i)=><div key={x} className="rounded-[20px] border border-white/[0.08] bg-white/[0.025] p-5"><div className="text-[8px] font-bold text-[#D6A66A]">0{i+1}</div><div className="mt-10 text-[14px] font-semibold text-white/78">{x}</div><div className="mt-2 text-[9px] text-white/34">Connected to the same creative intelligence.</div></div>)}</div></div></section>
<section className="bg-[#F7F6F3]"><div className="mx-auto max-w-[1120px] px-5 py-20 text-center sm:px-7 lg:px-10 lg:py-24"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A744B]">Creative production for real business</p><h2 className="mx-auto mt-4 max-w-4xl text-[40px] font-medium leading-[1.02] tracking-[-0.05em] sm:text-[52px]">Give the Studio the objective. Let the production system do the work.</h2><div className="mt-8 flex flex-wrap justify-center gap-2.5"><a href="/login" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171716] px-5 text-[11px] font-semibold text-white">Enter Avantiqo <Arrow className="h-3.5 w-3.5"/></a><a href="/developers" className="inline-flex h-11 items-center rounded-xl border border-black/[0.09] bg-white px-5 text-[11px] font-semibold text-[#56514A]">Developer access</a></div></div></section>
</main>}
