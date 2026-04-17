import AppShell from "../AppShell";

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="space-y-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-medium text-white/90">Dashboard</h1>
          <p className="text-sm text-white/50">
            Real-time performance and control overview
          </p>
        </div>

        <div className="relative">
          <div className="absolute -inset-6 rounded-[32px] bg-[#ff7a00]/10 blur-3xl" />
          <div className="relative rounded-[28px] border border-white/10 bg-white/[0.06] p-10 backdrop-blur-xl shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
            <div className="mb-3 text-sm text-white/50">Today Revenue</div>
            <div className="text-6xl font-semibold tracking-tight">THB 128,400</div>
            <div className="mt-2 text-sm text-white/40">+12% vs yesterday</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {[
            { label: "Orders", value: "342" },
            { label: "Avg Order", value: "THB 375" },
            { label: "FOH Score", value: "GOOD" },
          ].map((item) => (
            <div key={item.label} className="relative">
              <div className="absolute -inset-2 rounded-[20px] bg-white/5 blur-xl" />
              <div className="relative rounded-[20px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="mb-1 text-xs text-white/50">{item.label}</div>
                <div className="text-xl font-medium">{item.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}