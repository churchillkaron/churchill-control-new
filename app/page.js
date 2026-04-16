export default function Home() {
  return (
    <div className="relative min-h-screen text-white">

      {/* BACKGROUND IMAGE */}
      <div className="fixed inset-0 -z-30">
        <img
          src="/preview.jpg"
          alt="hero"
          className="w-full h-full object-cover"
        />
      </div>

      {/* DARK OVERLAY */}
      <div className="fixed inset-0 -z-20 bg-[linear-gradient(to_right,rgba(0,0,0,0.75),rgba(0,0,0,0.3))]" />

      {/* CONTENT */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-32">

        <div className="max-w-2xl space-y-6">

          {/* TITLE */}
          <h1 className="text-4xl md:text-5xl font-semibold leading-tight">
            Churchill Control System
          </h1>

          {/* HEADLINE */}
          <h2 className="text-3xl md:text-4xl font-semibold text-[#ff7a00]">
            Command Your Venue
          </h2>

          {/* SUBTEXT */}
          <p className="text-white/80 text-lg leading-relaxed">
            Real-time control of revenue, performance, and operations
            for premium hospitality venues.
          </p>

          {/* BUTTON */}
          <div>
            <a
              href="/control-final"
              className="inline-block px-8 py-4 rounded-xl bg-gradient-to-r from-[#ff7a00] to-[#ffb36b] text-white text-lg font-medium shadow-[0_0_25px_rgba(255,122,0,0.7)] hover:scale-[1.05] transition"
            >
              Enter Control →
            </a>
          </div>

        </div>

      </div>

    </div>
  );
}