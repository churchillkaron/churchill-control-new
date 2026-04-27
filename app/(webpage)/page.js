export default function Home() {
  return (
    <main>

      <section className="relative h-screen flex items-center justify-center text-center overflow-hidden">

        {/* Background */}
        <div className="absolute inset-0">
          <img
            src="/hero-restaurant.png"
            alt="Churchill Restaurant"
            className="w-full h-full object-cover scale-105"
          />
          <div className="absolute inset-0 bg-black/70"></div>
        </div>

        {/* Content */}
        <div className="relative z-10 px-6 max-w-3xl text-white">

          <p className="text-xs tracking-[0.35em] text-gray-400 mb-4">
            BAR & RESTAURANT · PHUKET
          </p>

          <h1 className="text-6xl md:text-7xl font-semibold mb-6">
            Churchill
          </h1>

          <p className="text-xl md:text-2xl text-gray-300 mb-4">
            Refined dining. Vibrant nights.
          </p>

          <p className="text-md md:text-lg text-gray-400 mb-10">
            Live music, crafted drinks, and games that bring people together.
          </p>

          <div className="flex justify-center gap-6 text-gray-300 text-sm mb-12 tracking-wide">
            <span>Dining</span>
            <span>+</span>
            <span>Bar</span>
            <span>+</span>
            <span>Games</span>
          </div>

          <div className="flex gap-4 justify-center">

            <a
              href="/menu"
              className="px-8 py-4 bg-[#ff7a00] rounded-full text-white font-medium shadow-lg shadow-orange-500/20 hover:scale-105 transition"
            >
              View Menu
            </a>

            <a
              href="/contact"
              className="px-8 py-4 border border-white/30 rounded-full hover:bg-white hover:text-black transition"
            >
              Book a Table
            </a>

          </div>

        </div>

      </section>

    </main>
  );
}