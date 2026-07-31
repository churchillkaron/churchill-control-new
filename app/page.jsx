import Link from "next/link";

export const dynamic = "force-dynamic";

const capabilities = [
  ["Finance", "Accounting, cash, billing, forecasting and executive control."],
  ["Operations", "Work, service delivery, incidents, evidence and performance."],
  ["Supply Chain", "Procurement, inventory, warehouses, suppliers and fulfilment."],
  ["Commercial", "Customers, sales, marketing, campaigns and connected channels."],
  ["People", "Workforce, scheduling, performance, learning and employee services."],
  ["Creative Studio", "Ads, films, images, websites and campaigns from one brief."],
  ["Projects", "Plans, budgets, resources, milestones, risks and delivery."],
  ["Intelligence", "Live analysis, decisions, predictions and autonomous action."],
];

const signals = [
  ["Revenue intelligence", "+18.4%", "Opportunity detected"],
  ["Operating control", "96.8%", "Within policy"],
  ["Working capital", "12.7 days", "Improving"],
  ["Campaign performance", "4.9×", "Scaling recommended"],
];

export default function AvantiqoLandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#030303] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(214,166,106,.13),transparent_35%),radial-gradient(circle_at_85%_25%,rgba(132,92,130,.09),transparent_28%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:72px_72px]" />

      <header className="relative z-20 mx-auto flex w-full max-w-[1500px] items-center justify-between px-6 py-6 lg:px-10">
        <Link href="/" className="flex items-center gap-3">
          <img src="/app/branding/avantiqo-logo.webp" alt="Avantiqo" className="h-11 w-auto object-contain" />
          <div>
            <div className="text-[15px] font-medium uppercase tracking-[0.34em] text-[#F3D99E]">Avantiqo</div>
            <div className="mt-1 text-[8px] uppercase tracking-[0.22em] text-white/40">Synthetic Intelligence Operating System</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-8 text-[10px] uppercase tracking-[0.2em] text-white/45 md:flex">
          <a href="#platform" className="transition hover:text-[#E7C17C]">Platform</a>
          <a href="#intelligence" className="transition hover:text-[#E7C17C]">Intelligence</a>
          <a href="#capabilities" className="transition hover:text-[#E7C17C]">Capabilities</a>
        </nav>

        <Link href="/login" className="rounded-full border border-[#D6A66A]/55 bg-[#D6A66A]/[0.07] px-5 py-2.5 text-[10px] font-medium uppercase tracking-[0.2em] text-[#F1D49B] transition hover:border-[#F2D18D] hover:bg-[#D6A66A]/[0.12]">
          Log in
        </Link>
      </header>

      <section className="relative z-10 mx-auto grid min-h-[760px] w-full max-w-[1500px] items-center gap-16 px-6 pb-20 pt-12 lg:grid-cols-[0.88fr_1.12fr] lg:px-10 lg:pb-28 lg:pt-20">
        <div className="max-w-[690px]">
          <div className="mb-7 inline-flex items-center gap-3 rounded-full border border-[#D6A66A]/20 bg-white/[0.025] px-4 py-2 text-[9px] uppercase tracking-[0.28em] text-[#DDBA7B]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#E4B763] shadow-[0_0_14px_rgba(228,183,99,.8)]" />
            Coming soon
          </div>

          <h1 className="max-w-[760px] font-serif text-[58px] font-normal leading-[0.98] tracking-[-0.035em] text-[#F7F2E9] sm:text-[76px] lg:text-[88px]">
            The operating system for an intelligent business.
          </h1>

          <p className="mt-8 max-w-[620px] text-[16px] leading-8 text-white/54 sm:text-[18px]">
            Avantiqo unifies every function of a company and adds a synthetic intelligence layer that can understand, decide, create and operate across the entire business.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link href="/login" className="rounded-full border border-[#F0CA83] bg-[linear-gradient(100deg,#81511f,#d6a653,#f1d290,#9a6227)] px-7 py-3.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-black shadow-[0_12px_35px_rgba(214,166,106,.16)] transition hover:brightness-110">
              Avantiqo login
            </Link>
            <a href="#platform" className="rounded-full border border-white/10 px-7 py-3.5 text-[10px] uppercase tracking-[0.2em] text-white/62 transition hover:border-white/25 hover:text-white">
              Explore the vision
            </a>
          </div>

          <div className="mt-12 flex flex-wrap gap-x-8 gap-y-3 text-[9px] uppercase tracking-[0.22em] text-white/28">
            <span>One business graph</span>
            <span>One intelligence layer</span>
            <span>One accountable system</span>
          </div>
        </div>

        <div id="platform" className="relative mx-auto w-full max-w-[780px]">
          <div className="absolute -inset-12 rounded-full bg-[#D6A66A]/[0.07] blur-3xl" />
          <div className="relative overflow-hidden rounded-[32px] border border-[#D6A66A]/25 bg-[linear-gradient(145deg,rgba(22,22,22,.96),rgba(5,5,5,.98))] p-4 shadow-[0_45px_140px_rgba(0,0,0,.75),0_0_80px_rgba(214,166,106,.06)] sm:p-6">
            <div className="flex items-center justify-between border-b border-white/[0.07] pb-5">
              <div>
                <div className="text-[9px] uppercase tracking-[0.25em] text-[#D6A66A]/70">Executive intelligence</div>
                <div className="mt-2 font-serif text-2xl text-white/92">Business command centre</div>
              </div>
              <div className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1.5 text-[8px] uppercase tracking-[0.18em] text-emerald-300">Live system</div>
            </div>

            <div className="grid gap-4 py-5 sm:grid-cols-2">
              {signals.map(([name, value, state]) => (
                <div key={name} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
                  <div className="text-[9px] uppercase tracking-[0.18em] text-white/34">{name}</div>
                  <div className="mt-4 flex items-end justify-between gap-4">
                    <div className="font-serif text-[29px] text-[#F4E5C3]">{value}</div>
                    <div className="pb-1 text-[8px] uppercase tracking-[0.14em] text-[#D6A66A]/65">{state}</div>
                  </div>
                  <div className="mt-5 h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full w-[76%] rounded-full bg-gradient-to-r from-[#7B4B20] via-[#D6A653] to-[#F2D38E]" />
                  </div>
                </div>
              ))}
            </div>

            <div id="intelligence" className="rounded-2xl border border-[#D6A66A]/18 bg-[radial-gradient(circle_at_20%_0%,rgba(214,166,106,.1),transparent_45%),rgba(255,255,255,.02)] p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.2em] text-[#D6A66A]/70">Synthetic intelligence</div>
                  <div className="mt-2 max-w-[480px] text-sm leading-6 text-white/58">Understands the business context, proposes action, creates the work and follows execution through to measurable outcome.</div>
                </div>
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-[#D6A66A]/35 bg-[#D6A66A]/[0.06] shadow-[0_0_40px_rgba(214,166,106,.12)]">
                  <div className="h-5 w-5 rotate-45 border border-[#E9C57E]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="capabilities" className="relative z-10 border-y border-white/[0.06] bg-white/[0.012] px-6 py-24 lg:px-10">
        <div className="mx-auto max-w-[1500px]">
          <div className="max-w-[840px]">
            <div className="text-[9px] uppercase tracking-[0.3em] text-[#D6A66A]/72">One system. Every function.</div>
            <h2 className="mt-5 font-serif text-[43px] leading-tight text-[#F5EFE5] sm:text-[58px]">A universal operating layer for the whole company.</h2>
            <p className="mt-6 max-w-[720px] text-[15px] leading-7 text-white/45">Avantiqo is not built around one industry. It adapts its capabilities, workflows, documents and intelligence to the organization it serves.</p>
          </div>

          <div className="mt-14 grid gap-px overflow-hidden rounded-[28px] border border-white/[0.07] bg-white/[0.07] sm:grid-cols-2 lg:grid-cols-4">
            {capabilities.map(([title, description], index) => (
              <article key={title} className="min-h-[220px] bg-[#080808] p-7 transition hover:bg-[#0D0C0A]">
                <div className="text-[9px] tracking-[0.22em] text-[#D6A66A]/40">0{index + 1}</div>
                <h3 className="mt-8 font-serif text-[25px] text-[#F0E9DE]">{title}</h3>
                <p className="mt-4 text-[12px] leading-6 text-white/38">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 px-6 py-28 lg:px-10">
        <div className="mx-auto max-w-[1180px] text-center">
          <div className="text-[9px] uppercase tracking-[0.32em] text-[#D6A66A]/70">Create · Operate · Scale</div>
          <h2 className="mx-auto mt-6 max-w-[950px] font-serif text-[46px] leading-[1.08] text-[#F6F0E6] sm:text-[66px]">From one instruction to accountable execution.</h2>
          <p className="mx-auto mt-7 max-w-[760px] text-[15px] leading-7 text-white/45">Brief Avantiqo on the outcome. The system can research, plan, produce, coordinate, publish, monitor and improve—while keeping people in control at meaningful decision gates.</p>
          <Link href="/login" className="mt-10 inline-flex rounded-full border border-[#D6A66A]/55 px-7 py-3.5 text-[10px] uppercase tracking-[0.2em] text-[#F0D29A] transition hover:bg-[#D6A66A]/10">Enter Avantiqo</Link>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.06] px-6 py-7 lg:px-10">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 text-[8px] uppercase tracking-[0.2em] text-white/25 sm:flex-row sm:items-center sm:justify-between">
          <span>Avantiqo · Synthetic Intelligence Operating System</span>
          <span>Coming soon</span>
        </div>
      </footer>
    </main>
  );
}
