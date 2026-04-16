export default function Home() {
  return (
    <div className="relative min-h-screen text-white overflow-hidden">

      {/* BACKGROUND */}
      <div className="fixed inset-0 -z-30">
        <img
          src="/bg-hero-control.jpg"
          alt="hero"
          className="w-full h-full object-cover"
          style={{ animation: "heroZoom 20s linear infinite" }}
        />
      </div>

      {/* OVERLAY */}
      <div className="fixed inset-0 -z-20 bg-[linear-gradient(to_right,rgba(0,0,0,0.76),rgba(0,0,0,0.28))]" />

      {/* GLOW */}
      <div
        className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_22%_35%,rgba(255,140,0,0.24),transparent_60%)]"
        style={{ animation: "glowPulse 6s ease-in-out infinite" }}
      />

      {/* CONTENT */}
      <div className="relative z-10 flex items-center min-h-screen max-w-7xl mx-auto px-6">

        <div className="max-w-2xl space-y-8">

          {/* LOGO (ANIMATED) */}
          <div
            className="flex items-center gap-4 opacity-0"
            style={{ animation: "fadeUp 1s ease-out forwards" }}
          >
            <span className="text-[#ff7a00] font-semibold text-3xl tracking-wider">
              CC
            </span>
            <span className="text-white text-2xl tracking-wide font-light">
              Churchill
            </span>
          </div>

          {/* TITLE */}
          <h1
            className="text-4xl md:text-5xl font-semibold leading-tight opacity-0"
            style={{ animation: "fadeUp 1s ease-out 0.2s forwards" }}
          >
            Control System
          </h1>

          {/* HEADLINE */}
          <h2
            className="text-3xl md:text-4xl font-semibold text-[#ff7a00] opacity-0"
            style={{ animation: "fadeUp 1s ease-out 0.4s forwards" }}
          >
            Command Your Venue
          </h2>

          {/* TEXT */}
          <p
            className="text-white/80 text-lg leading-relaxed opacity-0"
            style={{ animation: "fadeUp 1s ease-out 0.6s forwards" }}
          >
            Real-time control of revenue, performance, and operations for premium hospitality venues.
          </p>

          {/* CTA */}
          <div
            className="opacity-0"
            style={{ animation: "fadeUp 1s ease-out 0.8s forwards" }}
          >
            <a
              href="/control-final"
              className="inline-block px-10 py-5 rounded-2xl bg-gradient-to-r from-[#ff7a00] to-[#ffb36b] text-white text-xl font-medium shadow-[0_0_40px_rgba(255,122,0,0.9)] hover:scale-[1.08] hover:shadow-[0_0_60px_rgba(255,122,0,1)] transition"
            >
              Get Connected →
            </a>
          </div>

        </div>

      </div>

    </div>
  );
}