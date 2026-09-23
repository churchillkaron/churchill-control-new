import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import GuidedStart from "@/components/public/GuidedStart";

export const metadata = { title: "Start with Avantiqo | Avantiqo" };


function Arrow() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-3.5 w-3.5"
      fill="none"
    >
      <path
        d="M4 10h11M11 6l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function StartPage() {
  return (
    <main className="min-h-screen bg-[#F7F6F3] text-[#191919]">
      <PublicSiteHeader context="Start" audience="platform" tone="light" />
      <section className="relative overflow-hidden border-b border-black/[0.06] bg-[#F4F0E8]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(214,166,106,.14),transparent_30%)]" />
        <div className="relative mx-auto grid max-w-[1540px] lg:min-h-[690px] lg:grid-cols-[43%_57%]">
          <div className="flex items-center px-5 py-16 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
            <div className="max-w-[620px]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.30em] text-[#9A744B]">
                START WITH AVANTIQO
              </p>
              <h1 className="mt-5 text-[50px] font-medium leading-[.96] tracking-[-0.06em] text-[#171614] sm:text-[64px] lg:text-[72px]">
                Start with the problem you want to solve.
              </h1>
              <p className="mt-7 max-w-xl text-[16px] leading-8 text-[#625F59]">
                You do not need to understand Avantiqo before you begin. Choose what you want to improve, create or build. Avantiqo will take you to the right starting point and keep the rest connected when you need more.
              </p>
              <div className="mt-9 flex flex-wrap gap-2.5">
                <a
                  href="#access-path"
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white"
                >
                  Choose how I enter Avantiqo <Arrow />
                </a>
                <a
                  href="/pricing"
                  className="inline-flex h-11 items-center rounded-full border border-black/[0.10] bg-white/70 px-5 text-[10px] font-semibold text-[#56514A]"
                >
                  See pricing
                </a>
              </div>
            </div>
          </div>
          <div className="relative m-5 min-h-[560px] overflow-hidden rounded-[34px] border border-black/[0.08] bg-[#E9DFD1] shadow-[0_34px_100px_rgba(68,47,25,.13)] sm:m-7 lg:ml-0 lg:min-h-0 lg:self-stretch">
            <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"url(/art/commercial-start.jpg)"}} />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.01),rgba(20,15,10,.03)_50%,rgba(20,15,10,.26))]" />
            <div className="absolute left-5 top-5 rounded-full border border-white/68 bg-[#F8F0E6]/72 px-3 py-1.5 text-[7px] font-semibold uppercase tracking-[0.22em] text-[#8D6339] backdrop-blur-xl">AVANTIQO / START WITH THE WORK</div>
            <div className="absolute bottom-5 left-5 right-5 rounded-[22px] border border-white/72 bg-[#F8F1E8]/88 p-5 text-[#2B251F] shadow-[0_18px_50px_rgba(0,0,0,.12)] backdrop-blur-xl sm:p-6">
              <div className="text-[7px] font-semibold uppercase tracking-[0.21em] text-[#A36F39]">RUN · INDUSTRY · CREATE · BUILD · COMPUTE</div>
              <div className="mt-3 max-w-2xl text-[14px] leading-6 text-[#685E54]">Start with the outcome you need now. The rest of Avantiqo stays connected when the next need appears.</div>
            </div>
          </div>
        </div>
      </section>

      <section id="access-path" className="border-b border-black/[0.06] bg-[#FBFAF8]">
        <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A744B]">HOW ARE YOU ENTERING AVANTIQO?</p>
              <h2 className="mt-3 text-[38px] font-medium leading-[1.02] tracking-[-.05em] text-[#1D1B18] sm:text-[50px]">Create a business, or join one with the right authority.</h2>
            </div>
            <p className="max-w-2xl text-[12px] leading-6 text-[#706A62] lg:justify-self-end">Organization creation is only for people who should own or administer a new Avantiqo organization. Everyone else should enter through governed access to an existing organization.</p>
          </div>

          <div className="mt-10 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[
              {
                eyebrow:"CREATE ORGANIZATION",
                title:"Business owner / company admin",
                copy:"Create a new business organization, legal entity, Finance baseline and governed workspace.",
                href:"/signup?intent=business",
                cta:"Create business account",
                state:"SELF-SERVICE",
              },
              {
                eyebrow:"CREATE FIRM",
                title:"Accounting firm",
                copy:"Create the accounting firm as its own Avantiqo organization. Client access is granted separately; a client is never silently owned by the firm.",
                href:"/signup?intent=accounting_firm",
                cta:"Create accounting-firm account",
                state:"SELF-SERVICE",
              },
              {
                eyebrow:"BUILD / INTEGRATE",
                title:"Developer / integrator",
                copy:"Use the Developer surface to understand contracts and tooling. Live Developer Portal access remains scoped to an organization you own or have been granted access to.",
                href:"/developers",
                cta:"Open developer path",
                state:"ORG-SCOPED",
              },
              {
                eyebrow:"JOIN EMPLOYER",
                title:"Employee / staff member",
                copy:"Staff join an existing employer organization through staff access. They do not create a new Avantiqo business organization.",
                href:"/login?portal=staff",
                cta:"Staff Login",
                state:"INVITATION / EMPLOYER",
              },
              {
                eyebrow:"SELL TO BUSINESSES",
                title:"Supplier / vendor",
                copy:"Accept customer invitations, create a free supplier shop and become discoverable, or connect the same supplier identity to a full Avantiqo Business when you need ERP operations.",
                href:"/supplier-portal",
                cta:"Open Supplier Network",
                state:"INVITE · FREE SHOP · BUSINESS",
              },
              {
                eyebrow:"BUY / STAY / PAY",
                title:"Customer / guest",
                copy:"Use the secure one-time Customer Portal link sent by the business to see your orders, invoices, payments and linked bookings. Customer access never creates staff membership or an internal workspace.",
                href:"/customer-portal",
                cta:"Open Customer Portal",
                state:"SECURE LINK",
              },
              {
                eyebrow:"RETURN",
                title:"Returning business owner / admin",
                copy:"Already manage a business organization in Avantiqo? Use Business Login. Staff, suppliers, customers and external developers should use their dedicated entry paths above so Avantiqo preserves the correct authority model.",
                href:"/login?portal=business",
                cta:"Business Login",
                state:"BUSINESS ACCESS",
              },
            ].map((item)=><a key={item.title} href={item.href} className="group rounded-[24px] border border-black/[0.07] bg-white p-5 shadow-[0_12px_36px_rgba(48,35,22,.035)] transition hover:-translate-y-1 hover:border-[#B98A52]/45 hover:shadow-[0_20px_55px_rgba(55,39,22,.08)]">
              <div className="flex items-center justify-between gap-3"><span className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#9A744B]">{item.eyebrow}</span><span className="rounded-full border border-[#B98A52]/20 bg-[#FAF6EF] px-2.5 py-1 text-[6px] font-semibold uppercase tracking-[.12em] text-[#8A633C]">{item.state}</span></div>
              <h3 className="mt-7 text-[18px] font-semibold tracking-[-.03em] text-[#302D29]">{item.title}</h3>
              <p className="mt-3 min-h-[72px] text-[9px] leading-5 text-[#777169]">{item.copy}</p>
              <div className="mt-5 text-[8px] font-semibold text-[#815B36]">{item.cta} →</div>
            </a>)}
          </div>

          <div id="supplier-status" className="mt-8 scroll-mt-24 rounded-[22px] border border-[#B98A52]/20 bg-[#F3E7D7]/58 px-5 py-5 sm:px-6">
            <div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">SUPPLIER ACCESS</div>
            <div className="mt-2 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
              <p className="max-w-4xl text-[10px] leading-5 text-[#6D6257]">Supplier Network has three additive paths. Use customer-scoped invitation access only, create a free supplier shop and publish products to Avantiqo businesses, or connect that same supplier profile to a full Business workspace later. One login can keep all three connected.</p>
              <a href="/supplier-portal/onboarding" className="text-[9px] font-semibold text-[#815B36]">Choose supplier setup →</a>
            </div>
          </div>
        </div>
      </section>

      <GuidedStart />
      <section className="border-b border-black/[0.06] bg-[#FBFAF8]">
        <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
            <div><p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A744B]">PREFER TO BROWSE?</p><h2 className="mt-3 text-[36px] font-medium leading-[1.03] tracking-[-.05em] text-[#1D1B18] sm:text-[48px]">Enter Avantiqo through the kind of work you need.</h2></div>
            <p className="max-w-2xl text-[12px] leading-6 text-[#706A62] lg:justify-self-end">The guided recommendation above is the fastest route. These are the five main public entry points when you already know the kind of work you want.</p>
          </div>
          <div className="mt-10 grid overflow-hidden rounded-[24px] border border-black/[0.07] bg-white sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["RUN","Business Products","Finance · people · operations · stock","/products"],
              ["INDUSTRY","Solutions","Restaurant · hotel · retail · services","/solutions"],
              ["CREATE","Creative Studios","Image · film · music · voice","/creative-studios"],
              ["BUILD","Developers","APIs · integrations · software","/developers"],
              ["SCALE","Compute","Inference · rendering · batch","/compute"],
            ].map(([verb,title,detail,href],index)=><a key={verb} href={href} className={`group p-5 transition hover:bg-[#F9F4EC] ${index<4?'lg:border-r lg:border-black/[0.06]':''} ${index<4?'border-b border-black/[0.06] lg:border-b-0':''}`}><div className="flex items-center justify-between"><span className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#A37849]">{verb}</span><span className="text-[9px] text-[#B7AA9B] transition group-hover:translate-x-0.5 group-hover:text-[#8A633C]">→</span></div><div className="mt-8 text-[14px] font-semibold text-[#302D29]">{title}</div><div className="mt-2 text-[8px] leading-4 text-[#7B746C]">{detail}</div></a>)}
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-[22px] border border-[#B98A52]/20 bg-[#F3E7D7]/58 px-5 py-4 sm:px-6"><div><div className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">ONE ACCOUNT · ADD WHAT HELPS</div><div className="mt-1 text-[10px] text-[#6D6257]">Start focused. Your organization context stays connected when the next need appears.</div></div><a href="/pricing" className="text-[9px] font-semibold text-[#815B36]">See how pricing works →</a></div>
        </div>
      </section>
    </main>
  );
}
