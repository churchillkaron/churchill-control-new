"use client";

import { useState } from "react";

export default function Home() {
  const [showLogin, setShowLogin] = useState(false);

  return (
    <main className="relative min-h-screen flex items-center px-6">

      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <img
          src="/bg-hero-control.jpg"
          alt="Luxury beach"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/60" />
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto w-full grid md:grid-cols-2 gap-10 items-center">

        {/* LEFT SIDE */}
        <div className="space-y-6">

          <p className="text-sm tracking-[0.2em] text-white/60">
            CHURCHILL CONTROL SYSTEM
          </p>

          <h1 className="text-5xl md:text-6xl font-semibold text-white leading-tight">
            Total Control <br />
            <span className="text-[#ff7a00]">Over Your Venue</span>
          </h1>

          <p className="text-white/70 text-lg max-w-xl">
            Real-time control of revenue, staff performance, payroll, and daily operations —
            built for owners who demand clarity, accountability, and profit.
          </p>

          <div className="flex items-center gap-4 pt-4">
            <button
              onClick={() => setShowLogin(true)}
              className="bg-[#ff7a00] hover:opacity-90 text-white px-6 py-3 rounded-xl text-lg font-medium shadow-lg"
            >
              Access Control System
            </button>

            <div className="text-white/50 text-sm">
              For restaurants, bars, and venue groups
            </div>
          </div>
        </div>

        {/* RIGHT SIDE (GLASS CARD) */}
        <div className="rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl shadow-[0_20px_80px_rgba(0,0,0,0.5)]">

          <h2 className="text-white text-xl mb-4">
            One system. Full control.
          </h2>

          <div className="grid grid-cols-2 gap-4">

            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <p className="text-white/50 text-sm">Revenue</p>
              <p className="text-white font-medium">
                Know exactly where money goes
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <p className="text-white/50 text-sm">Staff</p>
              <p className="text-white font-medium">
                Track performance & behavior
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <p className="text-white/50 text-sm">Payroll</p>
              <p className="text-white font-medium">
                Automated accountability
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <p className="text-white/50 text-sm">Operations</p>
              <p className="text-white font-medium">
                Zero guesswork decisions
              </p>
            </div>

          </div>

          <div className="mt-6 text-white/60 text-sm">
            Replace spreadsheets, guesswork, and disconnected tools with one unified control system.
          </div>
        </div>
      </div>

      {/* LOGIN MODAL */}
      {showLogin && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] p-8 rounded-2xl w-full max-w-md space-y-4 border border-white/10">

            <h2 className="text-white text-xl">Login</h2>

            <input
              placeholder="Email"
              className="w-full p-3 rounded-lg bg-black/40 text-white border border-white/10"
            />

            <input
              placeholder="Password"
              type="password"
              className="w-full p-3 rounded-lg bg-black/40 text-white border border-white/10"
            />

            <button className="w-full bg-[#ff7a00] p-3 rounded-lg text-white">
              Enter
            </button>

            <button
              onClick={() => setShowLogin(false)}
              className="text-white/50 text-sm w-full"
            >
              Cancel
            </button>

          </div>
        </div>
      )}
    </main>
  );
}