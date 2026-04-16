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
      <div className="fixed inset-0 -z-20 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.7),rgba(0,0,0,0.3)) md:bg-[linear-gradient(to_right,rgba(0,0,0,0.75),rgba(0,0,0,0.25))]" />

      {/* GLOW */}
      <div
        className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_30%_30%,rgba(255,140,0,0.2),transparent_60%)]"
        style={{ animation: "glowPulse 6s ease-in-out infinite" }}
      />

      {/* CONTENT */}
      <div className="relative z-10 flex items-center min-h-screen max-w-7xl mx-auto px-6 py-24">

        <div className="max-w-xl space-y-6">

          {/* LOGO */}
          <div
            className="flex items-center gap-3 opacity-0"
            style={{ animation: "fadeUp 1s ease-out forwards" }}
          >
            <span className="text-[#ff7a00] font-semibold text-2xl md:text-3xl tracking-wider">
              CC
            </span>
            <span className="text-white text-xl md:text-2xl tracking-wide font-light">
              Churchill
            </span>
          </div>

          {/* TITLE */}
          <h1
            className="text-3xl md:text-5xl font-semibold leading-tight opacity-0"
            style={{ animation: "fadeUp 1s ease-out 0.2s forwards" }}
          >
            Control System
          </h1>

          {/* HEADLINE */}
          <h2
            className="text-2xl md:text-4xl font-semibold text-[#ff7a00] opacity-0"
            style={{ animation: "fadeUp 1s ease-out 0.4s forwards" }}
          >
            Command Your Venue
          </h2>

          {/* TEXT */}
          <p
            className="text-white/80 text-base md:text-lg leading-relaxed opacity-0"
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
              className="inline-block px-6 md:px-10 py-3 md:py-5 rounded-xl md:rounded-2xl bg-gradient-to-r from-[#ff7a00] to-[#ffb36b] text-white text-base md:text-xl font-medium shadow-[0_0_25px_rgba(255,122,0,0.8)] hover:scale-[1.05] transition"
            >
              Get Connected →
            </a>
          </div>

        </div>

      </div>

    </div>
  );
}