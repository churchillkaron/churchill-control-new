export default function LandingPage() {
  return (
    <div className="relative h-screen w-full text-white overflow-hidden">

      {/* 🔥 TEST FLAG (top left — proves deployment) */}
      <div className="absolute top-5 left-5 z-50 text-sm bg-red-600 px-3 py-1 rounded">
        NEW LANDING ACTIVE
      </div>

      {/* Background */}
      <div className="absolute inset-0">
        <img
          src="/bg-hero-control.jpg"
          alt="background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      </div>

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-6 text-center">

        {/* Label */}
        <div className="text-xs tracking-[0.3em] text-white/40 mb-4">
          AI MANAGEMENT ENGINE
        </div>

        {/* Title */}
        <h1 className="text-5xl md:text-7xl font-semibold mb-6 leading-tight bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent drop-shadow-[0_10px_40px_rgba(255,122,0,0.15)]">
          Restaurant Operating System
        </h1>

        {/* Subtext */}
        <p className="max-w-2xl text-white/70 text-lg md:text-xl mb-10">
          Intelligent,{" "}
          <span className="text-[#ff7a00]">AI-driven</span> control of operations, performance, financials, and customer behavior.
        </p>

        {/* CTA */}
        <div className="flex gap-4">
          <a
            href="/login"
            className="bg-[#ff7a00] px-8 py-3 rounded-xl text-white shadow-[0_10px_40px_rgba(255,122,0,0.25)] hover:brightness-110 transition"
          >
            Enter System
          </a>

          <button className="border border-white/20 px-8 py-3 rounded-xl hover:bg-white/10 transition">
            Request Demo
          </button>
        </div>

      </div>
    </div>
  );
}