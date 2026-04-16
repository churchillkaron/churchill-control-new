export default function Home() {
  return (
    <div className="relative min-h-screen text-white overflow-hidden">

      {/* BACKGROUND */}
      <div className="fixed inset-0 -z-30">
        <img
          src="/bg-hero-control.jpg"
          alt="hero"
          className="w-full h-full object-cover scale-105 animate-[slowZoom_20s_linear_infinite]"
        />
      </div>

      {/* DARK OVERLAY (LEFT FOCUS) */}
      <div className="fixed inset-0 -z-20 bg-[linear-gradient(to_right,rgba(0,0,0,0.75),rgba(0,0,0,0.25))]" />

      {/* LIGHT GLOW */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_25%_35%,rgba(255,140,0,0.25),transparent_60%)] animate-pulse" />

      {/* CONTENT */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-32">

        <div className="max-w-2xl space-y-6">

          {/* TITLE */}
          <h1 className="text-4xl md:text-5xl font-semibold leading-tight opacity-0 animate-[fadeUp_1s_ease-out_forwards]">
            Churchill Control System
          </h1>

          {/* HEADLINE */}
          <h2 className="text-3xl md:text-4xl font-semibold text-[#ff7a00] opacity-0 animate-[fadeUp_1s_ease-out_0.2s_forwards]">
            Command Your Venue
          </h2>

          {/* SUBTEXT */}
          <p className="text-white/80 text-lg leading-relaxed opacity-0 animate-[fadeUp_1s_ease-out_0.4s_forwards]">
            Real-time control of revenue, performance, and operations
            for premium hospitality venues.
          </p>

          {/* BUTTON */}
          <div className="opacity-0 animate-[fadeUp_1s_ease-out_0.6s_forwards]">
            <a
              href="/control-final"
              className="inline-block px-8 py-4 rounded-xl bg-gradient-to-r from-[#ff7a00] to-[#ffb36b] text-white text-lg font-medium shadow-[0_0_25px_rgba(255,122,0,0.7)] hover:scale-[1.08] hover:shadow-[0_0_40px_rgba(255,122,0,1)] transition"
            >
              Enter Control →
            </a>
          </div>

        </div>

      </div>

      {/* ANIMATIONS */}
      <style jsx global>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slowZoom {
          from {
            transform: scale(1.05);
          }
          to {
            transform: scale(1.15);
          }
        }
      `}</style>

    </div>
  );
}