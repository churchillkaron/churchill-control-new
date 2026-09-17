import PublicSiteHeader from "@/components/public/PublicSiteHeader";

export const metadata = {
  title: "API Platform | Avantiqo",
  description: "Governed Avantiqo capabilities through one metered API platform.",
};

const families = [
  ["Business APIs", "Finance, documents, operations, people and commercial capabilities exposed through governed endpoints."],
  ["Intelligence APIs", "Business-context reasoning, retrieval, planning and verified execution without rebuilding the operating layer."],
  ["Creative APIs", "Image, video and music jobs ranging from low-level generation to complete production missions."],
  ["Job APIs", "Submit longer-running workloads, track status, receive outputs and meter usage through the same commercial rail."],
];

export default function ApiPlatformPage() {
  return (
    <main className="min-h-screen bg-[#F7F6F3] text-[#191919]">
      <PublicSiteHeader
        context="API Platform"
        audience="api"
        links={[
          { label: "Overview", href: "#overview" },
          { label: "Capabilities", href: "#capabilities" },
          { label: "Developers", href: "/developers" },
          { label: "Compute", href: "/compute" },
        ]}
      />

      <section id="overview" className="relative overflow-hidden border-b border-black/[0.06] bg-[#F4F0E8]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(214,166,106,.15),transparent_32%)]" />
        <div className="relative mx-auto grid max-w-[1540px] lg:min-h-[690px] lg:grid-cols-[44%_56%]">
          <div className="flex items-center px-5 py-16 sm:px-7 lg:px-10 lg:py-20 xl:px-14">
            <div className="max-w-[620px]">
              <p className="text-[9px] font-semibold uppercase tracking-[0.26em] text-[#9A744B]">AVANTIQO API</p>
              <h1 className="mt-5 text-[52px] font-medium leading-[.95] tracking-[-0.065em] text-[#171614] sm:text-[66px] lg:text-[74px]">One API.<br />Real capabilities.</h1>
              <p className="mt-7 max-w-[560px] text-[16px] leading-8 text-[#625D55]">Use Avantiqo business, intelligence and production capabilities from your own product without becoming an ERP customer or entering the Business OS interface.</p>
              <div className="mt-9 flex flex-wrap gap-2.5">
                <a href="/developers" className="inline-flex h-11 items-center rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white">Developer documentation →</a>
                <a href="/pricing" className="inline-flex h-11 items-center rounded-full border border-black/[0.10] bg-white/70 px-5 text-[10px] font-semibold text-[#56514A]">API pricing</a>
              </div>
            </div>
          </div>
          <div className="relative min-h-[540px] overflow-hidden border-t border-black/[0.06] bg-[#11110F] lg:min-h-0 lg:border-l lg:border-t-0">
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/art/developer-work.jpg)" }} />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.26)_45%,rgba(9,8,7,.82))]" />
            <div className="absolute left-7 top-7 text-[7px] font-semibold uppercase tracking-[0.24em] text-[#F1C98E]">AVANTIQO / API RUNTIME</div>
            <div className="absolute bottom-7 left-7 right-7 rounded-[24px] border border-white/[0.14] bg-black/50 p-6 text-white backdrop-blur-xl">
              <div className="text-[7px] font-semibold uppercase tracking-[0.2em] text-[#D6A66A]">REQUEST → CONTEXT → CAPABILITY → EXECUTION → PROOF</div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {["Authenticated", "Metered", "Governed"].map((x) => <div key={x} className="rounded-xl border border-white/[0.09] bg-white/[0.03] px-3 py-3 text-[9px] text-white/64">{x}</div>)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="capabilities" className="bg-[#FBFAF8]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-7 lg:px-10 lg:py-24">
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">API capability families</p>
          <h2 className="mt-3 max-w-3xl text-[38px] font-medium leading-[1.03] tracking-[-0.05em] sm:text-[50px]">The API customer gets the interface they need—and nothing they do not.</h2>
          <div className="mt-10 grid gap-3 md:grid-cols-2">
            {families.map(([title, text], i) => (
              <article key={title} className="rounded-[22px] border border-black/[0.075] bg-white p-6">
                <div className="text-[8px] font-bold text-[#A37849]">0{i + 1}</div>
                <h3 className="mt-6 text-[18px] font-semibold text-[#302D29]">{title}</h3>
                <p className="mt-3 text-[11px] leading-6 text-[#77716A]">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
