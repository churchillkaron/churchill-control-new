import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import PublicArtStage from "@/components/public/PublicArtStage";

function Arrow({ className = "" }) {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function AvantiqoWorldPage({ config }) {
  const { context, eyebrow, title, intro, audience = "platform", tone = "light", image, artKind, sequence = [], capabilities = [], cta = "Start Now", ctaHref = "/start", secondary, secondaryHref } = config;
  return (
    <main className="min-h-screen bg-[#F7F4EE] text-[#171614]">
      <PublicSiteHeader context={context} audience={audience} tone={tone === "dark" ? "dark" : "light"} />
      <section className="relative overflow-hidden border-b border-[#CFC5B8]/45 bg-[linear-gradient(180deg,#F8F2E9_0%,#EEE2D3_100%)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_8%,rgba(255,255,255,.92),transparent_30%),radial-gradient(circle_at_76%_34%,rgba(214,166,106,.11),transparent_28%)]"/>
        <div className="pointer-events-none absolute -right-[18vw] -top-[37vw] hidden h-[74vw] w-[74vw] rounded-full border border-[#C99A62]/16 bg-[radial-gradient(circle_at_30%_70%,rgba(255,252,247,.97),rgba(224,208,188,.72)_28%,rgba(164,134,99,.18)_58%,transparent_72%)] lg:block"/>
        <div className="relative mx-auto grid max-w-[1460px] gap-12 px-5 py-14 sm:px-7 lg:min-h-[660px] lg:grid-cols-[.86fr_1.14fr] lg:items-center lg:px-10 lg:py-20">
          <div className="relative z-10 max-w-[700px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#B98A52]/26 bg-white/52 px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[.18em] text-[#8A633C]"><span className="h-1.5 w-1.5 rounded-full bg-[#B98548]"/>CONNECTED AVANTIQO WORLD</div>
            <p className="mt-8 text-[9px] font-semibold uppercase tracking-[0.28em] text-[#9A744B]">{eyebrow}</p>
            <h1 className="mt-5 text-[52px] font-medium leading-[.95] tracking-[-0.06em] text-[#171614] sm:text-[68px] lg:text-[76px]">{title}</h1>
            <p className="mt-7 max-w-xl text-[15px] leading-8 text-[#68635c]">{intro}</p>
            <div className="mt-9 flex flex-wrap gap-2.5">
              <a href={ctaHref} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#211C17] px-5 text-[10px] font-semibold text-white shadow-[0_10px_28px_rgba(20,18,15,.14)]">{cta}<Arrow className="h-3.5 w-3.5" /></a>
              {secondary ? <a href={secondaryHref} className="inline-flex h-11 items-center rounded-full border border-[#B98A52]/30 bg-white/58 px-5 text-[10px] font-semibold text-[#6A5540]">{secondary}</a> : null}
            </div>
            <div className="mt-9 flex flex-wrap gap-x-4 gap-y-2 border-t border-black/[.07] pt-5 text-[7px] font-semibold uppercase tracking-[.14em] text-[#8E8276]">{sequence.slice(0,5).map((item,i)=><span key={item} className="inline-flex items-center gap-4">{i>0?<span className="h-1 w-1 rounded-full bg-[#B98548]"/>:null}{item}</span>)}</div>
          </div>
          <div className="relative min-h-[560px] overflow-hidden rounded-[30px] border border-black/[0.07] bg-[#E9DFD1] shadow-[0_34px_100px_rgba(68,47,25,.12)]">
            {image ? <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${image})` }} /> : <div className="absolute inset-0"><PublicArtStage kind={artKind} /></div>}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.01),rgba(20,15,10,.03)_52%,rgba(20,15,10,.24))]" />
            <div className="absolute left-5 top-5 rounded-full border border-white/68 bg-[#F8F0E6]/72 px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[0.22em] text-[#8D6339] shadow-[0_10px_24px_rgba(50,35,20,.08)] backdrop-blur-xl">AVANTIQO / {context}</div>
            <div className="absolute bottom-5 left-5 right-5 rounded-[22px] border border-white/74 bg-[#F8F1E8]/91 p-5 text-[#2B251F] shadow-[0_18px_50px_rgba(0,0,0,.10)] backdrop-blur-xl sm:p-6">
              <div className="flex items-center justify-between gap-4"><div className="text-[7px] font-semibold uppercase tracking-[0.20em] text-[#A36F39]">OPERATING FLOW</div><div className="text-[6px] uppercase tracking-[.16em] text-[#9A8B7B]">ONE CONTEXT</div></div>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-[10px] text-[#685E54]">{sequence.map((item, i) => <span key={item} className="inline-flex items-center gap-3"><span>{item}</span>{i < sequence.length - 1 ? <span className="text-[#B07A42]">→</span> : null}</span>)}</div>
            </div>
          </div>
        </div>
      </section>
      {context === "Intelligence" ? <section id="company-memory" className="border-b border-black/[0.07] bg-[#EEE6DB] text-[#1D1B18]">
        <div className="mx-auto max-w-[1380px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[.24em] text-[#9A744B]">COMPANY MEMORY</p>
              <h2 className="mt-4 max-w-xl text-[42px] font-medium leading-[.98] tracking-[-.055em] sm:text-[56px]">The company should remember what people promised.</h2>
            </div>
            <p className="max-w-2xl text-[13px] leading-7 text-[#6D645B] lg:justify-self-end">Important business facts are usually buried in WhatsApp, LINE, email, calls, meetings, contracts, PDFs and people&apos;s heads. Avantiqo can continuously scan the connected sources, keep the important information, preserve where it came from and connect it to the customer, supplier, employee, project, invoice, contract or task it affects.</p>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
            <div className="rounded-[30px] border border-black/[0.07] bg-[#F9F4EC] p-6 shadow-[0_20px_55px_rgba(55,39,22,.06)] sm:p-7">
              <div className="flex items-center justify-between gap-4 border-b border-black/[0.06] pb-5">
                <div><div className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#9A6A37]">01 · LISTEN TO THE BUSINESS</div><div className="mt-2 text-[24px] font-medium tracking-[-.04em]">Scan the conversations already happening.</div></div>
                <div className="rounded-full border border-[#D6A66A]/28 bg-white/58 px-3 py-1.5 text-[7px] font-semibold text-[#826545]">CONNECTED SOURCES</div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {["WhatsApp","LINE","Email","Meetings","Contracts","PDFs","Notes","Calls","Portal"].map((item)=><div key={item} className="rounded-[15px] border border-black/[0.06] bg-white/58 px-3 py-3 text-[8px] font-semibold text-[#62584E]">{item}</div>)}
              </div>
              <div className="mt-6 rounded-[18px] border border-[#D6A66A]/22 bg-[#F2E5D3] p-4">
                <div className="text-[7px] font-semibold uppercase tracking-[.16em] text-[#9A6A37]">Example message</div>
                <p className="mt-2 text-[12px] leading-6 text-[#50463C]">“Supplier ABC will replace the damaged stock by 21 September. We need it before the weekend orders.”</p>
              </div>
            </div>

            <div className="rounded-[30px] border border-[#C8B7A0]/45 bg-[linear-gradient(135deg,#FFF9F0_0%,#F2E5D4_58%,#E6C79C_100%)] p-6 shadow-[0_24px_70px_rgba(56,39,22,.08)] sm:p-7">
              <div className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#9A6A37]">02 · TURN WORDS INTO BUSINESS MEMORY</div>
              <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {[["WHO","Supplier ABC"],["PROMISED WHAT","Replace damaged stock"],["TO WHOM","Your company"],["WHEN","21 Sep"],["CONDITIONS","Before weekend orders"],["EVIDENCE","Original message attached"]].map(([a,b])=><div key={a} className="rounded-[16px] border border-black/[0.06] bg-white/54 p-4"><div className="text-[6px] font-semibold uppercase tracking-[.16em] text-[#A4774B]">{a}</div><div className="mt-2 text-[10px] font-semibold leading-5 text-[#3B342E]">{b}</div></div>)}
              </div>
              <div className="mt-5 rounded-[18px] border border-black/[0.07] bg-white/56 p-4">
                <div className="text-[7px] font-semibold uppercase tracking-[.16em] text-[#9A6A37]">CONNECTED CONSEQUENCE</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">{[["Stock","Projected shortage 23 Sep"],["Orders","3 customer orders depend on it"],["Revenue","THB 182,000 potentially affected"]].map(([a,b])=><div key={a}><div className="text-[8px] font-semibold text-[#40372F]">{a}</div><div className="mt-1 text-[7px] leading-4 text-[#847566]">{b}</div></div>)}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
            <div className="rounded-[28px] border border-black/[0.07] bg-white/54 p-6 sm:p-7">
              <div className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#9A744B]">03 · WATCH WHAT MATTERS</div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[["Commitment at risk","No shipment evidence yet","Contact supplier today"],["Decision remembered","Price increase approved in March","Show evidence + outcome"],["Promise coming due","Permit renewal in November","Prepare renewal workflow"]].map(([a,b,c])=><div key={a} className="rounded-[18px] border border-black/[0.06] bg-[#F9F4EC] p-4"><div className="text-[10px] font-semibold text-[#342E28]">{a}</div><div className="mt-2 text-[8px] leading-4 text-[#7B7065]">{b}</div><div className="mt-4 text-[7px] font-semibold text-[#9A6A37]">{c} →</div></div>)}
              </div>
            </div>
            <div className="rounded-[28px] border border-black/[0.07] bg-[#F3E8D8] p-6 sm:p-7">
              <div className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#9A6A37]">04 · REMEMBER THE OUTCOME</div>
              <h3 className="mt-4 text-[28px] font-medium leading-[1.02] tracking-[-.045em]">Not just what the company knows. How the company learned.</h3>
              <p className="mt-4 text-[10px] leading-6 text-[#6D6257]">When a commitment is completed, a decision succeeds or an intervention fails, Avantiqo keeps the result with the original evidence. Months later the business can ask what happened, why the decision was made and whether it actually worked.</p>
              <div className="mt-6 flex flex-wrap gap-2">{["Commitments","Decisions","Evidence","Outcomes","Lessons"].map(x=><span key={x} className="rounded-full border border-[#B98A52]/24 bg-white/52 px-3 py-1.5 text-[7px] font-semibold tracking-[.12em] text-[#755D45]">{x}</span>)}</div>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-[30px] border border-black/[0.07] bg-[#F9F4EC] shadow-[0_24px_70px_rgba(55,39,22,.06)]">
            <div className="grid gap-0 lg:grid-cols-[.74fr_1.26fr]">
              <div className="border-b border-black/[0.06] p-6 sm:p-7 lg:border-b-0 lg:border-r">
                <div className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#9A744B]">05 · FROM CONVERSATION TO REAL WORK</div>
                <h3 className="mt-4 max-w-md text-[32px] font-medium leading-[1.01] tracking-[-.05em]">Avantiqo should not leave important work inside a chat.</h3>
                <p className="mt-4 max-w-md text-[10px] leading-6 text-[#6D6257]">It scans connected conversations, keeps the information worth remembering, understands what kind of business event happened and sends that event to the place where the company actually manages it.</p>
                <div className="mt-7 space-y-2">
                  {["Read the message and surrounding conversation","Keep durable facts, promises, dates and context","Recognize the business object","Route it to the correct Avantiqo workspace","Keep the original conversation attached as evidence"].map((x,i)=><div key={x} className="flex items-start gap-3 rounded-[14px] border border-black/[0.05] bg-white/48 px-3.5 py-3"><span className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#D6A66A]/35 bg-[#F1E1CC] text-[7px] font-semibold text-[#8F653C]">0{i+1}</span><span className="text-[8px] leading-4 text-[#62584E]">{x}</span></div>)}
                </div>
              </div>

              <div className="p-6 sm:p-7">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#9A6A37]">LIVE EXAMPLE · PEST CONTROL</div>
                    <div className="mt-2 text-[21px] font-medium tracking-[-.04em] text-[#342E28]">A booking message becomes a booking.</div>
                  </div>
                  <div className="rounded-full border border-[#D6A66A]/25 bg-[#F3E6D5] px-3 py-1.5 text-[6px] font-semibold uppercase tracking-[.14em] text-[#8B6742]">NO COPY / PASTE</div>
                </div>

                <div className="mt-6 grid gap-3 xl:grid-cols-[1fr_auto_1fr_auto_1fr] xl:items-stretch">
                  <div className="rounded-[18px] border border-[#D6A66A]/22 bg-[#F2E5D3] p-4">
                    <div className="flex items-center justify-between"><span className="text-[7px] font-semibold uppercase tracking-[.14em] text-[#8C6540]">WHATSAPP</span><span className="h-2 w-2 rounded-full bg-[#B98548]"/></div>
                    <div className="mt-5 rounded-[14px] rounded-bl-[5px] bg-white/70 p-3 text-[10px] leading-5 text-[#4E443B] shadow-[0_7px_20px_rgba(70,48,27,.05)]">“Hi, can you come Friday at 10 for tick treatment at our villa in Rawai?”</div>
                    <div className="mt-4 text-[6px] uppercase tracking-[.14em] text-[#978675]">Customer conversation</div>
                  </div>
                  <div className="hidden items-center text-[#A36F39] xl:flex">→</div>
                  <div className="rounded-[18px] border border-black/[0.06] bg-white/58 p-4">
                    <div className="text-[7px] font-semibold uppercase tracking-[.14em] text-[#9A744B]">AVANTIQO UNDERSTANDS</div>
                    <div className="mt-4 grid grid-cols-2 gap-2">{[["SERVICE","Tick treatment"],["DATE","Friday"],["TIME","10:00"],["LOCATION","Rawai villa"]].map(([a,b])=><div key={a} className="rounded-[11px] border border-black/[0.05] bg-[#FBF7F1] p-2.5"><div className="text-[5px] font-semibold tracking-[.13em] text-[#A17B55]">{a}</div><div className="mt-1 text-[7px] font-semibold text-[#41382F]">{b}</div></div>)}</div>
                    <div className="mt-3 text-[6px] leading-4 text-[#8A7B6B]">The customer identity and original message remain connected.</div>
                  </div>
                  <div className="hidden items-center text-[#A36F39] xl:flex">→</div>
                  <div className="rounded-[18px] border border-[#B98A52]/26 bg-[#FFF9F0] p-4 shadow-[0_12px_30px_rgba(65,44,24,.05)]">
                    <div className="text-[7px] font-semibold uppercase tracking-[.14em] text-[#9A6A37]">PEST CONTROL / BOOKINGS</div>
                    <div className="mt-4 rounded-[13px] border border-black/[0.06] bg-white/65 p-3">
                      <div className="flex items-center justify-between"><div className="text-[9px] font-semibold text-[#342E28]">Tick treatment</div><div className="rounded-full bg-[#E9D3B4] px-2 py-1 text-[5px] font-semibold uppercase tracking-[.12em] text-[#75583A]">NEW</div></div>
                      <div className="mt-3 space-y-2 text-[7px] text-[#706459]"><div className="flex justify-between"><span>When</span><strong className="font-semibold text-[#433A32]">Friday · 10:00</strong></div><div className="flex justify-between"><span>Site</span><strong className="font-semibold text-[#433A32]">Rawai villa</strong></div><div className="flex justify-between"><span>Source</span><strong className="font-semibold text-[#433A32]">WhatsApp</strong></div></div>
                    </div>
                    <div className="mt-3 text-[6px] uppercase tracking-[.13em] text-[#8B7B6B]">Ready for scheduling / dispatch</div>
                  </div>
                </div>

                <div className="mt-5 rounded-[16px] border border-black/[0.06] bg-white/48 px-4 py-3.5">
                  <div className="text-[6px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">THE IMPORTANT DIFFERENCE</div>
                  <div className="mt-2 text-[9px] leading-5 text-[#62584E]">The message is still searchable and remembered, but the operational fact now lives in <strong className="font-semibold text-[#342E28]">Bookings</strong> — where staff can schedule, dispatch, complete, document and bill the service.</div>
                </div>
              </div>
            </div>

            <div className="border-t border-black/[0.06] bg-[#F3EADD] p-5 sm:p-6">
              <div className="grid gap-7 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
                <div>
                  <div className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#9A744B]">THE SAME IDEA ACROSS EVERY INDUSTRY</div>
                  <h3 className="mt-3 text-[27px] font-medium leading-[1.02] tracking-[-.045em] text-[#332D27]">A message can become the complete customer journey.</h3>
                  <p className="mt-3 text-[9px] leading-5 text-[#6C6156]">Avantiqo understands what the customer is asking for, creates the correct business object, opens the customer-facing experience and keeps payment, service and follow-up connected.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {[["Hotel guest asks to book 3 nights","Hotel / Reservation","Reservation + guest record + stay context"],["Pest-control customer books a treatment","Pest Control / Booking","Service booking + site + treatment context"],["Restaurant guest books a table","Restaurant / Reservations","Booking + guest + service context"],["Field-service customer requests a visit","Field Service / Work Order","Appointment + work order + service history"],["Agency client approves a project","Projects / Engagement","Scope + approval + billing context"],["Retail customer orders remotely","Commerce / Order","Order + customer + fulfillment context"]].map(([a,b,c])=><div key={a} className="rounded-[15px] border border-black/[0.05] bg-white/52 p-3.5"><div className="text-[8px] font-semibold leading-4 text-[#3D352E]">{a}</div><div className="mt-2 text-[6px] font-semibold uppercase tracking-[.13em] text-[#9A6A37]">→ {b}</div><div className="mt-2 text-[7px] leading-4 text-[#817365]">{c}</div></div>)}</div>
              </div>
            </div>

            <div className="border-t border-black/[0.06] bg-[#FBF7F1] p-5 sm:p-6">
              <div className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#9A744B]">BOOKING → CUSTOMER PORTAL → PAYMENT → SERVICE</div>
              <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] xl:items-stretch">
                {[
                  ["01","BOOKING CREATED","Message or email becomes the correct booking, reservation, order or service request."],
                  ["02","CUSTOMER PORTAL","Avantiqo prepares the customer-facing portal for that customer and booking."],
                  ["03","PAYMENT","Deposit, balance or invoice can be paid from the same portal through the configured payment flow."],
                  ["04","SERVICE + HISTORY","Payment, service delivery, documents, receipts and future conversations stay connected to the customer."],
                ].map(([n,t,c],i)=><div key={t} className="contents"><div className="rounded-[18px] border border-black/[0.06] bg-[#F7F0E6] p-4"><div className="text-[6px] font-semibold text-[#A36F39]">{n}</div><div className="mt-3 text-[9px] font-semibold text-[#352F29]">{t}</div><div className="mt-2 text-[7px] leading-4 text-[#817365]">{c}</div></div>{i<3?<div className="hidden items-center text-[#A36F39] xl:flex">→</div>:null}</div>)}
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-[1.05fr_.95fr]">
                <div className="rounded-[18px] border border-[#D6A66A]/22 bg-[#F2E5D3] p-4">
                  <div className="text-[7px] font-semibold uppercase tracking-[.16em] text-[#9A6A37]">EXAMPLE · HOTEL</div>
                  <div className="mt-3 rounded-[14px] bg-white/62 p-3 text-[9px] leading-5 text-[#51483F]">Email: “We need one room from 24–27 September for two adults. Can we pay the deposit now?”</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">{[["Reservation","24–27 Sep · 2 adults"],["Portal","Guest access + booking details"],["Payment","Deposit / balance due"]].map(([a,b])=><div key={a} className="rounded-[12px] border border-black/[0.05] bg-white/56 p-3"><div className="text-[6px] font-semibold uppercase tracking-[.13em] text-[#9A744B]">{a}</div><div className="mt-1.5 text-[7px] font-semibold text-[#41382F]">{b}</div></div>)}</div>
                </div>
                <div className="rounded-[18px] border border-black/[0.06] bg-[#F7F0E6] p-4">
                  <div className="text-[7px] font-semibold uppercase tracking-[.16em] text-[#9A6A37]">THE CUSTOMER SEES ONE CONTINUOUS EXPERIENCE</div>
                  <div className="mt-4 space-y-2">{["Booking / reservation details","Amount due and payment status","Documents, confirmations and receipts","Messages and service updates","Future bookings and customer history"].map((x,i)=><div key={x} className="flex items-center gap-3 rounded-[12px] border border-black/[0.05] bg-white/56 px-3 py-2.5"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E9D3B4] text-[6px] font-semibold text-[#75583A]">0{i+1}</span><span className="text-[7px] text-[#5C5147]">{x}</span></div>)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[22px] border border-black/[0.07] bg-[#F9F4EC] px-5 py-4 sm:px-6">
            <div className="text-[8px] font-semibold uppercase tracking-[.15em] text-[#77695B]">EVERY CONVERSATION → RIGHT BUSINESS OBJECT → CUSTOMER PORTAL → PAYMENT → SERVICE → COMPANY MEMORY</div>
            <a href="/products#intelligence" className="text-[8px] font-semibold text-[#8D6339]">Explore Intelligence →</a>
          </div>
        </div>
      </section> : null}
      <section className="bg-[#FBFAF7]">
        <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-px overflow-hidden rounded-[28px] border border-black/[0.07] bg-black/[0.07] sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map(([name, copy], i) => <div key={name} className="bg-[#F7F1E8] p-6 sm:p-7"><div className="text-[7px] font-semibold uppercase tracking-[0.17em] text-[#A37849]">0{String(i + 1).padStart(2,"0")}</div><h2 className="mt-4 text-[23px] font-medium tracking-[-0.04em] text-[#1D1B18]">{name}</h2><p className="mt-3 text-[11px] leading-6 text-[#746F68]">{copy}</p></div>)}
          </div>
        </div>
      </section>
    </main>
  );
}
