"use client";

import { useState } from "react";
import { motion } from "framer-motion";

export default function LandingPage() {
  const [showLogin, setShowLogin] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("staff");

  const handleLogin = () => {
    if (!name || !role) return;

    localStorage.setItem("staffName", name);
    localStorage.setItem("staffRole", role);

    if (role === "staff") window.location.href = "/pos";
    if (role === "accounting") window.location.href = "/accounting";
    if (role === "manager") window.location.href = "/dashboard";
    if (role === "owner") window.location.href = "/control-final";
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0d0a07] text-white">

      {/* BACKGROUND */}
      <motion.div
        initial={{ scale: 1.05 }}
        animate={{ scale: 1.08 }}
        transition={{ duration: 30, ease: "linear" }}
        className="fixed inset-0 z-0"
      >
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/bg-hero-control.jpg')" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(255,122,0,0.18),transparent_35%),linear-gradient(180deg,rgba(0,0,0,0.35)_0%,rgba(0,0,0,0.65)_60%,rgba(0,0,0,0.85)_100%)]" />
        <div className="absolute inset-0 shadow-[inset_0_0_200px_rgba(0,0,0,0.7)]" />
      </motion.div>

      {/* CONTENT */}
      <div className="relative z-10 min-h-screen flex items-center">
        <div className="max-w-7xl mx-auto px-6 md:px-10 w-full">

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

            {/* LEFT */}
            <div className="space-y-6">

              <span className="text-xs tracking-[0.25em] text-white/40">
                CHURCHILL CONTROL SYSTEM
              </span>

              <h1 className="text-5xl md:text-6xl font-semibold leading-tight">
                Total Control
                <br />
                <span className="text-[#ff7a00]">Over Your Venue</span>
              </h1>

              <p className="text-white/60 max-w-lg">
                Real-time control of revenue, staff performance, payroll, and daily operations.
              </p>

              {/* BUTTON */}
              <div className="relative inline-block">
                <div className="absolute -inset-2 bg-[#ff7a00]/20 blur-xl rounded-xl" />

                <button
                  onClick={() => setShowLogin(true)}
                  className="relative px-7 py-3 rounded-xl bg-[#ff7a00] text-black font-medium hover:scale-[1.02] transition"
                >
                  Access Control System
                </button>
              </div>
            </div>

            {/* RIGHT PANEL */}
            <div className="relative rounded-[32px] border border-white/10 bg-white/[0.06] backdrop-blur-xl p-8">
              <h3 className="text-lg mb-6 text-white/80">
                One system. Full control.
              </h3>
            </div>

          </div>
        </div>
      </div>

      {/* LOGIN MODAL */}
      {showLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1a140f] p-8 rounded-2xl w-full max-w-md border border-white/10">

            <h2 className="text-xl mb-6">Login</h2>

            <input
              type="text"
              placeholder="Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mb-4 px-4 py-2 rounded bg-black/40 border border-white/10"
            />

            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full mb-6 px-4 py-2 rounded bg-black/40 border border-white/10"
            >
              <option value="staff">Staff</option>
              <option value="accounting">Accounting</option>
              <option value="manager">Manager</option>
              <option value="owner">Owner</option>
            </select>

            <button
              onClick={handleLogin}
              className="w-full py-2 rounded bg-[#ff7a00] text-black font-medium"
            >
              Enter System
            </button>

            <button
              onClick={() => setShowLogin(false)}
              className="w-full mt-3 text-white/40 text-sm"
            >
              Cancel
            </button>

          </div>
        </div>
      )}
    </div>
  );
}