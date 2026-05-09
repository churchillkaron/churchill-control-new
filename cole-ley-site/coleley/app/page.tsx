export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white">

      {/* HERO */}
      <div
        className="h-screen bg-cover bg-center flex items-center justify-center"
        style={{ backgroundImage: "url('/hero.jpg')" }}
      >
        <div className="text-center bg-black/50 p-10 rounded-xl backdrop-blur-md">
          <h1 className="text-5xl font-bold mb-4">
            Cole Ley
          </h1>

          <p className="text-lg text-white/70 mb-6">
            Premium Live Entertainment
          </p>

          <div className="flex gap-4 justify-center">
            <a href="/login" className="bg-orange-500 px-6 py-3 rounded-xl">
              Client Login
            </a>

            <a href="#" className="border border-white/20 px-6 py-3 rounded-xl">
              Book Now
            </a>
          </div>
        </div>
      </div>

      {/* GALLERY */}
      <div className="p-10 grid grid-cols-2 md:grid-cols-3 gap-4">
        <img src="/1.jpg" className="rounded-xl" />
        <img src="/2.jpg" className="rounded-xl" />
        <img src="/3.jpg" className="rounded-xl" />
      </div>

    </div>
  );
}