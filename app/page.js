"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const [showLogin, setShowLogin] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("staff");

  const router = useRouter();

  const handleLogin = () => {
    if (!name || !role) return;

    localStorage.setItem("staffName", name);
    localStorage.setItem("staffRole", role);

    if (role === "staff") router.push("/pos");
    if (role === "accounting") router.push("/accounting");
    if (role === "manager") router.push("/dashboard");
    if (role === "owner") router.push("/control-final");
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0d0a07] text-white">

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
      </motion.div>

      <div className="relative z-10 min-h-screen flex items-center justify-center text-center">
        <div>
          <h1 className="text-5xl font-semibold mb-6">
            Total Control
            <br />
            <span className="text-[#ff7a00]">Over Your Venue</span>
          </h1>

          <button
            onClick={() => setShowLogin(true)}
            className="bg-[#ff7a00] px-8 py-3 rounded-xl text-black font-medium"
          >
            Access Control System
          </button>
        </div>
      </div>

      {showLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
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
              className="w-full py-2 rounded bg-[#ff7a00] text-black"
            >
              Enter System
            </button>
          </div>
        </div>
      )}
    </div>
  );
}