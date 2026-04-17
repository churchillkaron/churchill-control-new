"use client";

export default function AppShell({ children, className = "" }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0d0a07] text-white">
      {/* Fixed cinematic background */}
      <div className="fixed inset-0 z-0">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-[1.04]"
          style={{ backgroundImage: "url('/bg-beach.jpg')" }}
        />

        {/* Depth wash */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,122,0,0.16),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.05),transparent_22%),linear-gradient(180deg,rgba(8,6,5,0.46)_0%,rgba(8,6,5,0.72)_38%,rgba(8,6,5,0.88)_100%)]" />

        {/* Strong dark overlay for premium contrast */}
        <div className="absolute inset-0 bg-black/45" />

        {/* Soft vignette */}
        <div className="absolute inset-0 shadow-[inset_0_0_180px_rgba(0,0,0,0.65)]" />

        {/* Ambient glow layers */}
        <div className="absolute -top-24 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[#ff7a00]/10 blur-3xl" />
        <div className="absolute top-[22%] right-[8%] h-[240px] w-[240px] rounded-full bg-white/5 blur-3xl" />
      </div>

      {/* Scroll layer */}
      <div className="relative z-10 min-h-screen">
        {/* Top fade to detach content from background */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/30 to-transparent" />

        {/* Main content wrapper */}
        <main className="relative z-10">
          <div className={`mx-auto max-w-7xl px-6 pt-24 pb-10 md:px-8 lg:px-10 ${className}`}>
            {/* Floating content plane */}
            <div className="relative">
              {/* Backplate glow */}
              <div className="pointer-events-none absolute inset-x-6 -top-6 -bottom-6 rounded-[34px] bg-white/[0.03] blur-2xl" />

              {/* Glass content container */}
              <div className="relative rounded-[32px] border border-white/10 bg-white/[0.045] shadow-[0_30px_80px_rgba(0,0,0,0.45),0_8px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.10)] backdrop-blur-[18px]">
                {/* Inner light shaping */}
                <div className="pointer-events-none absolute inset-0 rounded-[32px] bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.02)_22%,rgba(255,255,255,0.01)_100%)]" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-[32px] bg-white/20" />
                <div className="relative p-4 md:p-6 lg:p-8">{children}</div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}