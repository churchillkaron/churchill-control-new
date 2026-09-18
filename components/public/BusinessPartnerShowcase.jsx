export default function BusinessPartnerShowcase({ compact = false }) {
  const signals = [
    ["01", "Revenue", "Updated from sales"],
    ["02", "People", "Attendance exceptions"],
    ["03", "Finance", "Invoices need attention"],
  ];
  return (
    <div className={"relative overflow-hidden rounded-[28px] border border-black/[0.08] bg-[#11100E] text-white shadow-[0_30px_90px_rgba(35,27,20,.18)] " + (compact ? "p-4" : "p-5 sm:p-6")}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_10%,rgba(214,166,106,.10),transparent_30%)]" />
      <div className="relative rounded-[20px] border border-white/[0.08] bg-[#171512]">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div>
            <div className="text-[7px] font-semibold uppercase tracking-[.2em] text-[#D6A66A]">AVANTIQO BUSINESS PARTNER</div>
            <div className="mt-1 text-[7px] text-white/30">Connected business context</div>
          </div>
          <div className="flex items-center gap-2 text-[7px] text-white/34"><span className="h-1.5 w-1.5 rounded-full bg-[#D6A66A]"/>Ready</div>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[.82fr_1.18fr]">
          <div className="rounded-[16px] border border-white/[0.07] bg-black/20 p-4">
            <div className="text-[7px] uppercase tracking-[.16em] text-white/28">Business Partner</div>
            <div className="mt-4 text-[15px] leading-6 text-white/82">
              I’ve checked the connected business records. There are a few items that may need your attention today.
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {["POS","Finance","Workforce","Inventory"].map((x)=><span key={x} className="rounded-full border border-white/[0.08] bg-white/[0.025] px-2.5 py-1.5 text-[6px] tracking-[.12em] text-white/38">{x}</span>)}
            </div>
          </div>

          <div className="space-y-2">
            {signals.map(([no,title,note])=><div key={title} className="flex items-center gap-3 rounded-[14px] border border-white/[0.07] bg-white/[0.025] px-4 py-3">
              <span className="text-[7px] font-semibold text-[#D6A66A]">{no}</span>
              <div className="min-w-0 flex-1"><div className="text-[9px] font-semibold text-white/70">{title}</div><div className="mt-1 text-[7px] text-white/28">{note}</div></div>
              <span className="text-[7px] text-white/24">Review →</span>
            </div>)}
          </div>
        </div>

        <div className="border-t border-white/[0.07] p-4">
          <div className="flex items-center gap-3 rounded-[14px] border border-white/[0.08] bg-black/20 px-4 py-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#D6A66A]/35 text-[8px] text-[#D6A66A]">A</span>
            <span className="flex-1 text-[9px] text-white/30">Ask anything about your business…</span>
            <span className="text-[10px] text-[#D6A66A]">→</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[6px] uppercase tracking-[.12em] text-white/22">
            <span>Evidence connected</span><span>Actions governed</span><span>Results recorded</span>
          </div>
        </div>
      </div>
    </div>
  );
}
