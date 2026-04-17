import AppShell from "../AppShell";

export default function ControlFinalPage() {
  return (
    <AppShell>
      <div className="space-y-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-medium text-white/90">Control Final</h1>
          <p className="text-sm text-white/50">
            End-of-day control and payout decision system
          </p>
        </div>

        <div className="relative">
          <div className="absolute -inset-6 rounded-[36px] bg-[#ff7a00]/12 blur-3xl" />
          <div className="relative rounded-[32px] border border-white/10 bg-white/[0.07] px-10 py-12 backdrop-blur-xl shadow-[0_50px_140px_rgba(0,0,0,0.7),0_15px_50px_rgba(0,0,0,0.5)]">
            <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
              <div className="space-y-3">
                <div className="text-sm text-white/50">Today Revenue</div>
                <div className="text-6xl font-semibold tracking-tight">THB 128,400</div>
                <div className="text-sm text-white/40">Service Charge Pool: THB 6,420</div>
              </div>

              <button className="rounded-xl bg-[#ff7a00] px-8 py-4 text-lg font-medium text-black shadow-[0_15px_40px_rgba(0,0,0,0.6)] transition hover:scale-[1.02]">
                Close Day
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}