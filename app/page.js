"use client";

export default function LandingPage() {
  return (
    <div className="h-screen flex items-center justify-center">

      <div className="text-center max-w-3xl px-6">

        {/* LOGO */}
        <div className="mb-6">
          <span className="text-orange-500 text-3xl font-bold">CC</span>
          <span className="ml-2 text-white text-2xl tracking-wide">
            Churchill
          </span>
        </div>

        {/* HEADLINE */}
        <h1 className="text-5xl md:text-6xl font-semibold leading-tight mb-6">
          Command Your Venue
        </h1>

        {/* SUBTEXT */}
        <p className="text-white/70 text-lg mb-10">
          Real-time control of revenue, staff performance, and operations —
          built for premium venues.
        </p>

        {/* CTA */}
        <button className="
          px-8 py-4 rounded-xl
          bg-orange-500
          text-black font-semibold
          text-lg
          shadow-[0_10px_30px_rgba(255,122,0,0.4)]
          hover:scale-105 transition
        ">
          Enter Control →
        </button>

      </div>

    </div>
  );
}