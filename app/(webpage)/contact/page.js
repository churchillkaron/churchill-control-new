export default function Contact() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">

      <div className="w-full max-w-xl">

        {/* Title */}
        <h1 className="text-4xl md:text-5xl font-semibold mb-4 text-center">
          Book a Table
        </h1>

        <p className="text-gray-400 text-center mb-10">
          Reserve your table at Churchill. We’ll confirm your booking shortly.
        </p>

        {/* Form */}
        <form className="space-y-6">

          <input
            type="text"
            placeholder="Your Name"
            className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:outline-none"
          />

          <input
            type="text"
            placeholder="Phone / WhatsApp"
            className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:outline-none"
          />

          <div className="grid grid-cols-2 gap-4">
            <input
              type="date"
              className="p-4 rounded-xl bg-white/5 border border-white/10 focus:outline-none"
            />
            <input
              type="time"
              className="p-4 rounded-xl bg-white/5 border border-white/10 focus:outline-none"
            />
          </div>

          <input
            type="number"
            placeholder="Number of Guests"
            className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:outline-none"
          />

          <textarea
            placeholder="Special requests (optional)"
            rows="4"
            className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:outline-none"
          />

          {/* Button */}
          <button
            type="submit"
            className="w-full py-4 bg-[#ff7a00] rounded-xl text-white font-medium hover:opacity-90 transition"
          >
            Request Reservation
          </button>

        </form>

      </div>

    </main>
  );
}