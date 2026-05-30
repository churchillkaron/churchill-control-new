export default function WorkforceActivityFeed() {
  const items = [
    "Shift schedule updated",
    "Payroll processing this week",
    "New document available",
    "Training assignment added",
  ];

  return (
    <section className="mt-4 rounded-[34px] border border-white/10 bg-white/[0.03] backdrop-blur-2xl p-5">
      <div className="text-[10px] uppercase tracking-[0.35em] text-cyan-400">
        Recent Activity
      </div>

      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div
            key={item}
            className="rounded-[22px] border border-white/5 bg-black/20 px-4 py-3 text-sm text-white/70"
          >
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}
