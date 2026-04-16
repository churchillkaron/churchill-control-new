export default function Dashboard() {
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

        <h1 className="text-3xl mb-6">Dashboard</h1>

        <div className="bg-white/10 backdrop-blur-xl p-8 rounded-2xl border border-white/10">
          <p className="text-white/60">Today Revenue</p>
          <h2 className="text-4xl">THB 128,450</h2>
          <p className="text-[#ff7a00]">+12% vs yesterday</p>
        </div>

      </div>
    </div>
  );
}