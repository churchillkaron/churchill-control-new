export default function Payout() {
  return (
    <div className="min-h-screen relative text-white">

      {/* BACKGROUND */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/bg-hero-control.jpg')" }}
      />
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* CONTENT */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-28">

        <h1 className="text-3xl mb-6">Payout System</h1>

        <div className="bg-white/10 backdrop-blur-xl p-8 rounded-2xl border border-white/10">
          <p className="text-white/60">Service charge & staff payout</p>
          <h2 className="text-xl mt-2">Coming next phase</h2>
        </div>

      </div>
    </div>
  );
}