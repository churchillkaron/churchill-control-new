export default function BusinessPartnerShowcase({ compact = false }) {
  const signals = [
    ["01", "Revenue", "Sales evidence connected"],
    ["02", "People", "Attendance exception detected"],
    ["03", "Finance", "Invoices need attention"],
  ];
  return (
    <div className={"relative overflow-hidden rounded-[28px] border border-[#C8B7A0]/45 bg-[linear-gradient(135deg,#FFF9F0_0%,#F2E5D4_58%,#E6C79C_100%)] text-[#2B251F] shadow-[0_28px_80px_rgba(48,32,18,.10)] " + (compact ? "p-4" : "p-5 sm:p-6")}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_10%,rgba(255,255,255,.55),transparent_30%)]" />
      <div className="relative rounded-[20px] border border-white/72 bg-white/40 backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4">
          <div>
            <div className="text-[7px] font-semibold uppercase tracking-[.2em] text-[#9A6A37]">AVANTIQO BUSINESS PARTNER</div>
            <div className="mt-1 text-[7px] text-[#8B7D6C]">Connected business context</div>
          </div>
          <div className="flex items-center gap-2 text-[7px] text-[#766A5D]"><span className="h-1.5 w-1.5 rounded-full bg-[#B98548]"/>Ready</div>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[.82fr_1.18fr]">
          <div className="rounded-[16px] border border-black/[0.06] bg-white/55 p-4">
            <div className="text-[7px] uppercase tracking-[.16em] text-[#9A744B]">Business Partner</div>
            <div className="mt-4 text-[15px] leading-6 text-[#3B342E]">
              Tell me what you need done. I can investigate the evidence, reason across the business, prepare the work, execute approved capabilities and verify the result.
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {["POS","Finance","Workforce","Inventory"].map((x)=><span key={x} className="rounded-full border border-black/[0.06] bg-white/55 px-2.5 py-1.5 text-[6px] tracking-[.12em] text-[#74685D]">{x}</span>)}
            </div>
          </div>

          <div className="space-y-2">
            {signals.map(([no,title,note])=><div key={title} className="flex items-center gap-3 rounded-[14px] border border-black/[0.06] bg-white/52 px-4 py-3">
              <span className="text-[7px] font-semibold text-[#A36F39]">{no}</span>
              <div className="min-w-0 flex-1"><div className="text-[9px] font-semibold text-[#302A24]">{title}</div><div className="mt-1 text-[7px] text-[#8A7B6B]">{note}</div></div>
              <span className="text-[7px] text-[#776A5D]">Review →</span>
            </div>)}
          </div>
        </div>

        <div className="border-t border-black/[0.06] p-4">
          <div className="flex items-center gap-3 rounded-[14px] border border-black/[0.06] bg-white/55 px-4 py-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#D6A66A]/45 bg-[#F4E4CF] text-[8px] text-[#8E643B]">A</span>
            <span className="flex-1 text-[9px] text-[#827465]">Ask, create, fix, reconcile, schedule, review…</span>
            <span className="text-[10px] text-[#A36F39]">→</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[6px] uppercase tracking-[.12em] text-[#8C7B6A]">
            <span>Evidence connected</span><span>Actions governed</span><span>Results recorded</span>
          </div>
        </div>
      </div>
    </div>
  );
}
