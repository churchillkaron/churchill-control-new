"use client";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0d0a07] text-white">

      {/* FIXED BACKGROUND */}
      <div className="fixed inset-0 z-0">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-[1.05]"
          style={{ backgroundImage: "url('/bg-hero-control.jpg')" }}
        />

        {/* depth gradients */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(255,122,0,0.18),transparent_35%),linear-gradient(180deg,rgba(0,0,0,0.35)_0%,rgba(0,0,0,0.65)_60%,rgba(0,0,0,0.85)_100%)]" />

        {/* vignette */}
        <div className="absolute inset-0 shadow-[inset_0_0_200px_rgba(0,0,0,0.7)]" />
      </div>

      {/* SCROLL LAYER */}
      <div className="relative z-10 min-h-screen flex items-center">
        <div className="max-w-7xl mx-auto px-6 md:px-10 w-full">

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

            {/* LEFT SIDE */}
            <div className="space-y-6">

              <span className="text-xs tracking-[0.25em] text-white/40">
                CHURCHILL CONTROL SYSTEM
              </span>

              <h1 className="text-5xl md:text-6xl font-semibold leading-tight">
                Total Control
                <br />
                <span className="text-[#ff7a00]">Over Your Venue</span>
              </h1>

              <p className="text-white/60 max-w-lg">
                Real-time control of revenue, staff performance, payroll, and daily operations — built for owners who demand clarity, accountability, and profit.
              </p>

              {/* CTA */}
              <div className="relative inline-block">
                <div className="absolute -inset-2 bg-[#ff7a00]/20 blur-xl rounded-xl" />

                <button className="relative px-7 py-3 rounded-xl bg-[#ff7a00] text-black font-medium shadow-[0_10px_30px_rgba(0,0,0,0.5)] hover:scale-[1.02] transition">
                  Access Control System
                </button>
              </div>

              <p className="text-white/30 text-sm">
                For restaurants, bars, and venue groups
              </p>
            </div>

            {/* RIGHT SIDE (FLOATING SYSTEM PANEL) */}
            <div className="relative">

              {/* glow behind */}
              <div className="absolute -inset-10 bg-white/5 blur-3xl rounded-[40px]" />

              <div className="relative rounded-[32px] border border-white/10 bg-white/[0.06] backdrop-blur-xl p-8
                shadow-[0_40px_120px_rgba(0,0,0,0.7),0_10px_40px_rgba(0,0,0,0.5)]
              ">

                {/* top light line */}
                <div className="absolute inset-x-0 top-0 h-px bg-white/30 rounded-t-[32px]" />

                <h3 className="text-lg mb-6 text-white/80">
                  One system. Full control.
                </h3>

                <div className="grid grid-cols-2 gap-4">

                  {[
                    ["Revenue", "Know exactly where money goes"],
                    ["Staff", "Track performance & behavior"],
                    ["Payroll", "Automated accountability"],
                    ["Operations", "Zero guesswork decisions"],
                  ].map(([title, desc], i) => (
                    <div
                      key={i}
                      className="relative rounded-[18px] border border-white/10 bg-white/[0.05] p-4
                        shadow-[0_15px_40px_rgba(0,0,0,0.4)]
                      "
                    >
                      <div className="text-white/70 text-xs mb-1">
                        {title}
                      </div>
                      <div className="text-white/90 text-sm">
                        {desc}
                      </div>
                    </div>
                  ))}

                </div>

                <p className="text-white/40 text-sm mt-6">
                  Replace spreadsheets, guesswork, and disconnected tools with one unified control system.
                </p>

              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}