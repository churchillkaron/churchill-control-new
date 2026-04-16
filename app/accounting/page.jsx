export default function Accounting() {
  const expenses = [
    { name: "Food Cost", value: "38,200", status: "Normal" },
    { name: "Staff Cost", value: "52,800", status: "High" },
    { name: "Utilities", value: "9,400", status: "Stable" },
  ];

  return (
    <div className="relative min-h-screen text-white overflow-hidden">

      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-30">
        <img
          src="/bg-hero-control.jpg"
          alt="Accounting background"
          className="w-full h-full object-cover"
        />
      </div>

      {/* OVERLAY */}
      <div className="absolute inset-0 -z-20 bg-[linear-gradient(to_bottom,rgba(8,8,8,0.75),rgba(18,12,8,0.85))]" />

      {/* GLOW */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_70%_20%,rgba(255,140,0,0.15),transparent_40%)]" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 pt-28 pb-14 space-y-8">

        {/* HEADER */}
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            Accounting
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold mt-2">
            Cost Control
          </h1>
          <p className="text-white/60 mt-2 max-w-xl">
            Track expenses, monitor margins, and control financial performance.
          </p>
        </div>

        {/* HERO */}
        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6 md:p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            <div>
              <p className="text-white/50 text-sm">Total Expenses</p>
              <h2 className="text-3xl mt-2">THB 100,400</h2>
            </div>

            <div>
              <p className="text-white/50 text-sm">Revenue</p>
              <h2 className="text-3xl mt-2">THB 128,450</h2>
            </div>

            <div>
              <p className="text-white/50 text-sm">Net Profit</p>
              <h2 className="text-3xl mt-2 text-[#ffb36b]">THB 28,050</h2>
            </div>

          </div>
        </div>

        {/* EXPENSE LIST */}
        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6 md:p-8">

          <div className="flex justify-between mb-4">
            <h3 className="text-xl font-semibold">Expense Breakdown</h3>
            <p className="text-white/50 text-sm">Live tracking</p>
          </div>

          <div className="space-y-4">
            {expenses.map((item, i) => (
              <div
                key={i}
                className="flex justify-between items-center p-4 rounded-xl bg-black/30 border border-white/10"
              >
                <div>
                  <p className="text-sm text-white/50">Category</p>
                  <p className="text-lg font-medium">{item.name}</p>
                </div>

                <div>
                  <p className="text-sm text-white/50">Amount</p>
                  <p className="text-lg">THB {item.value}</p>
                </div>

                <div className="text-right">
                  <p className="text-sm text-white/50">Status</p>
                  <p className="text-[#ffb36b]">{item.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}