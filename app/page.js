"use client";

import { useState } from "react";

export default function LandingPage() {
  const [showLogin, setShowLogin] = useState(false);

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/bg-hero-control.jpg')" }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/58 to-black/72" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,122,0,0.16),transparent_35%)]" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl items-center px-6">
        <div className="grid w-full items-center gap-12 lg:grid-cols-2">
          <div>
            <div className="mb-6 inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm tracking-[0.2em] text-white/70 backdrop-blur-md">
              CHURCHILL CONTROL SYSTEM
            </div>

            <h1 className="text-5xl font-semibold leading-[0.95] text-white md:text-7xl">
              The Operating System
              <span className="block text-orange-400">for Profitable Venues</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75 md:text-xl">
              Control revenue, staff performance, payroll, and daily operations
              from one premium system built for serious hospitality businesses.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
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

          <div className="hidden lg:block">
            <div className="rounded-[28px] border border-white/15 bg-white/10 p-6 backdrop-blur-2xl shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
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
            </div>
          </div>
        </div>
      </div>

      {showLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowLogin(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-[28px] border border-white/15 bg-white/10 p-8 backdrop-blur-2xl shadow-[0_20px_80px_rgba(0,0,0,0.5)]">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-sm tracking-[0.2em] text-white/50">LOGIN</p>
                <h2 className="mt-2 text-3xl font-semibold text-white">
                  Access Churchill
                </h2>
              </div>
              <button
                onClick={() => setShowLogin(false)}
                className="text-xl text-white/60 hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <input
                type="email"
                placeholder="Email"
                className="w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-white placeholder:text-white/35"
              />
              <input
                type="password"
                placeholder="Password"
                className="w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-white placeholder:text-white/35"
              />
              <button className="w-full rounded-2xl bg-orange-500 px-5 py-3 font-semibold text-black hover:bg-orange-400">
                Login
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}