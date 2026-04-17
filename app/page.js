"use client";

import { useState } from "react";

export default function LandingPage() {
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = (e) => {
    e.preventDefault();

    // Replace this later with your real auth logic
    if (email && password) {
      window.location.href = "/dashboard";
    }
  };

  return (
    <div
      className="relative min-h-screen bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/bg-hero-control.jpg')" }}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/65 to-black/80" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,122,0,0.18),transparent_35%)]" />

      {/* Content */}
      <div className="relative z-10 flex min-h-screen items-center px-6">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-12 lg:grid-cols-2">
          {/* Left side */}
          <div className="max-w-2xl">
            <div className="mb-6 inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm tracking-[0.2em] text-white/70 backdrop-blur-md">
              CHURCHILL CONTROL SYSTEM
            </div>

            <h1 className="animate-[fadeUp_0.9s_ease-out] text-5xl font-semibold leading-tight text-white md:text-7xl">
              The Operating System
              <span className="block text-orange-400">for Profitable Venues</span>
            </h1>

            <p className="mt-6 max-w-xl animate-[fadeUp_1.15s_ease-out] text-lg leading-relaxed text-white/75 md:text-xl">
              Control revenue, staff performance, payroll, and daily operations
              from one premium system built for serious hospitality businesses.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4 animate-[fadeUp_1.35s_ease-out]">
              <button
                onClick={() => setShowLogin(true)}
                className="rounded-2xl bg-orange-500 px-8 py-4 text-base font-semibold text-black shadow-[0_12px_35px_rgba(255,122,0,0.35)] transition hover:scale-[1.02] hover:bg-orange-400"
              >
                Login to System
              </button>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/65 backdrop-blur-md">
                Premium control for restaurants, bars, and venue groups
              </div>
            </div>
          </div>

          {/* Right side visual */}
          <div className="hidden lg:block">
            <div className="relative overflow-hidden rounded-[28px] border border-white/15 bg-white/8 p-6 backdrop-blur-2xl shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.18),rgba(255,255,255,0.03),transparent)]" />
              <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-orange-400/20 blur-3xl" />

              <div className="relative z-10 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white/55">Luxury Hospitality Control</p>
                    <h3 className="mt-1 text-2xl font-semibold text-white">
                      One place. Full clarity.
                    </h3>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-orange-300">
                    Live System
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                    <p className="text-sm text-white/55">Revenue Control</p>
                    <p className="mt-2 text-xl font-semibold text-white">Daily visibility</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                    <p className="text-sm text-white/55">Staff Performance</p>
                    <p className="mt-2 text-xl font-semibold text-white">Behavior tracking</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                    <p className="text-sm text-white/55">Payroll & Approval</p>
                    <p className="mt-2 text-xl font-semibold text-white">Structured control</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                    <p className="text-sm text-white/55">Operational Clarity</p>
                    <p className="mt-2 text-xl font-semibold text-white">Manager oversight</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/6 p-5">
                  <p className="text-sm text-white/55">Why it matters</p>
                  <p className="mt-3 text-base leading-relaxed text-white/78">
                    Replace spreadsheets, guesswork, and disconnected tools with a control
                    system built to improve accountability, decision-making, and profit.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Login Modal */}
      {showLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowLogin(false)}
          />

          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-[28px] border border-white/15 bg-white/10 p-8 backdrop-blur-2xl shadow-[0_20px_80px_rgba(0,0,0,0.5)]">
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.03),transparent)]" />
            <div className="relative z-10">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <p className="text-sm tracking-[0.2em] text-white/50">LOGIN</p>
                  <h2 className="mt-2 text-3xl font-semibold text-white">
                    Access Churchill
                  </h2>
                </div>
                <button
                  onClick={() => setShowLogin(false)}
                  className="text-xl text-white/60 transition hover:text-white"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm text-white/60">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-white outline-none placeholder:text-white/30"
                    placeholder="you@company.com"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-white/60">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-white outline-none placeholder:text-white/30"
                    placeholder="Enter password"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-2xl bg-orange-500 px-5 py-3 font-semibold text-black transition hover:bg-orange-400"
                >
                  Login
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(28px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}