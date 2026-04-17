"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="h-screen flex items-center justify-center px-6">

      <div className="max-w-6xl w-full grid md:grid-cols-2 gap-12 items-center">

        {/* LEFT CONTENT */}
        <motion.div
          initial={{ opacity: 0, x: -80 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="mb-6 text-orange-400 text-sm tracking-widest">
            CC CHURCHILL CONTROL SYSTEM
          </div>

          <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6">
            Command Your Venue
          </h1>

          <p className="text-lg text-white/70 mb-10">
            Real-time control of revenue, staff performance, and operations.
            Designed for premium venues that demand clarity, accountability,
            and growth.
          </p>

          <button
            onClick={() => router.push("/dashboard")}
            className="px-8 py-4 bg-orange-500 hover:bg-orange-600 rounded-xl text-lg font-semibold shadow-xl transition"
          >
            Enter System →
          </button>
        </motion.div>

        {/* RIGHT VISUAL GLASS CARD */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="hidden md:block"
        >
          <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-[0_20px_60px_rgba(0,0,0,0.7)]">

            <div className="text-white/80 text-sm mb-4">
              Live Operational Control
            </div>

            <div className="space-y-3 text-sm text-white/70">
              <div>Revenue: THB 96,230</div>
              <div>Orders: 14 Open</div>
              <div>FOH Score: 82</div>
              <div>Status: Stable</div>
            </div>

            <div className="mt-6 h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="w-2/3 h-full bg-orange-500" />
            </div>

          </div>
        </motion.div>

      </div>

    </div>
  );
}