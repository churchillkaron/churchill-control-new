import PublicSiteHeader from "@/components/public/PublicSiteHeader";

export const dynamic = "force-dynamic";

export default function SubscribePage() {
  return (
    <main className="min-h-screen bg-[#F7F3EC] text-[#171614]">
      <PublicSiteHeader context="Activate" audience="platform" tone="light" />
      <section className="relative overflow-hidden border-b border-[#CFC5B8]/45 bg-[linear-gradient(180deg,#F8F2E9_0%,#EEE2D3_100%)]">
        <div className="pointer-events-none absolute -right-[18vw] -top-[38vw] hidden h-[76vw] w-[76vw] rounded-full border border-[#C99A62]/18 bg-[radial-gradient(circle_at_28%_72%,rgba(255,252,247,.98),rgba(226,210,189,.78)_28%,rgba(174,145,110,.26)_56%,transparent_72%)] lg:block" />
        <div className="relative mx-auto grid max-w-[1380px] gap-10 px-5 py-14 sm:px-7 lg:min-h-[650px] lg:grid-cols-[.88fr_1.12fr] lg:items-center lg:px-10 lg:py-20">
          <div className="max-w-[650px]">
            <p className="text-[9px] font-semibold uppercase tracking-[.24em] text-[#9A744B]">AVANTIQO / GET STARTED</p>
            <h1 className="mt-5 text-[50px] font-medium leading-[.95] tracking-[-.06em] sm:text-[66px]">Set up the real organization. Not a demo account.</h1>
            <p className="mt-6 max-w-xl text-[14px] leading-7 text-[#6B645C]">Sign in first. If your account does not yet have an Avantiqo organization, the authenticated onboarding flow will collect the business, owner and Finance context required to provision it correctly.</p>
            <div className="mt-8 flex flex-wrap gap-2.5"><a href="/login?portal=business" className="inline-flex h-11 items-center rounded-full bg-[#211C17] px-5 text-[10px] font-semibold text-white shadow-[0_10px_28px_rgba(20,18,15,.14)]">Sign in and continue →</a><a href="/start" className="inline-flex h-11 items-center rounded-full border border-[#B98A52]/32 bg-white/58 px-5 text-[10px] font-semibold text-[#76502E]">Choose where to start</a></div>
            <p className="mt-5 text-[8px] leading-4 text-[#877B6E]">Existing Avantiqo customers return to their current workspace. New authenticated customers continue into organization onboarding.</p>
          </div>
          <div className="rounded-[32px] border border-white/80 bg-white/44 p-5 shadow-[0_28px_90px_rgba(79,55,30,.10)] backdrop-blur-xl sm:p-7">
            <div className="text-[8px] font-semibold uppercase tracking-[.2em] text-[#9A744B]">WHAT HAPPENS NEXT</div>
            <div className="mt-6 space-y-2">{[["01","Authenticate","Use the account that will own or administer the Avantiqo organization."],["02","Describe the organization","Confirm legal/business identity, industry, country, currency and accounting context."],["03","Confirm the owner","Attach the primary owner/contact to the setup before anything is provisioned."],["04","Provision and verify","Avantiqo creates the organization and routes you into the real workspace only after successful provisioning."]].map(([n,title,copy])=><div key={n} className="grid grid-cols-[40px_1fr] gap-4 rounded-[18px] border border-[#BDAF9E]/28 bg-[#FFFDF9]/72 p-4"><div className="text-[8px] font-bold text-[#A37849]">{n}</div><div><div className="text-[13px] font-semibold text-[#302A24]">{title}</div><div className="mt-1 text-[9px] leading-5 text-[#786F65]">{copy}</div></div></div>)}</div>
            <div className="mt-5 rounded-[18px] border border-[#B98A52]/20 bg-[#F3E7D7]/66 p-4 text-[8px] leading-5 text-[#715A42]"><span className="font-semibold">No fake activation step.</span> Organization creation happens only inside the authenticated onboarding contract.</div>
          </div>
        </div>
      </section>
    </main>
  );
}
