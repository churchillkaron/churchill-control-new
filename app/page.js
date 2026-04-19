export default function LandingPage() {
  return (
    <div className="relative h-screen w-full text-white overflow-hidden">

      {/* Background */}
      <div className="absolute inset-0">
        <img
          src="/bg-hero-control.jpg"
          alt="background"
          className="w-full h-full object-cover scale-105 blur-[2px]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/60 to-black/80" />
      </div>

      {/* Content */}
      <div className="relative z-10 h-full flex items-center justify-center px-6">

        {/* Glass Container */}
        <div className="text-center backdrop-blur-xl bg-white/[0.04] border border-white/10 rounded-3xl px-10 py-12 shadow-[0_20px_80px_rgba(0,0,0,0.6)] max-w-3xl">

          {/* Label */}
          <div className="text-[11px] tracking-[0.4em] text-white/50 mb-6">
            AI MANAGEMENT ENGINE
          </div>

          {/* Title */}
          <h1 className="text-5xl md:text-7xl font-semibold mb-6 leading-tight bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">
            Restaurant Operating System
          </h1>

          {/* Subtext */}
          <p className="text-white/70 text-lg md:text-xl mb-10 leading-relaxed">
            Intelligent,{" "}
            <span className="text-[#ff7a00] font-medium">AI-driven</span> control of operations, performance, financials, and customer behavior.
          </p>

          {/* CTA */}
          <div className="flex justify-center gap-4">
            <a
              href="/login"
              className="bg-[#ff7a00] px-8 py-3 rounded-xl text-white shadow-[0_10px_40px_rgba(255,122,0,0.35)] hover:brightness-110 transition"
            >
              Enter System
            </a>

            <button className="border border-white/20 px-8 py-3 rounded-xl hover:bg-white/10 transition">
              Request Demo
            </button>
          </div>

        </div>
      </div>

    </div>
  );
}