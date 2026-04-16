"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [showLogin, setShowLogin] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("FOH");

  const router = useRouter();

  const handleLogin = () => {
    if (!name) return;

    localStorage.setItem("staffName", name);
    localStorage.setItem("staffRole", role);

    router.push("/control-final");
  };

  return (
    <div className="relative min-h-screen text-white flex items-center justify-center">

      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-30">
        <img
          src="/bg-hero-control.jpg"
          className="w-full h-full object-cover"
        />
      </div>

      <div className="absolute inset-0 -z-20 bg-black/60" />

      {/* HERO CONTENT */}
      <div className="text-center space-y-6">

        <h1 className="text-4xl font-semibold">
          Churchill Control System
        </h1>

        <p className="text-white/70">
          Real-time restaurant control and decision engine
        </p>

        <button
          onClick={() => setShowLogin(true)}
          className="px-6 py-3 bg-orange-500 rounded-xl text-white text-lg"
        >
          Get Connected
        </button>

      </div>

      {/* 🔥 LOGIN MODAL */}
      {showLogin && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">

          <div className="bg-white/10 backdrop-blur-xl p-8 rounded-3xl border border-white/10 w-full max-w-md space-y-4">

            <h2 className="text-xl">Staff Login</h2>

            <input
              type="text"
              placeholder="Your name"
              className="w-full p-3 rounded-xl bg-black/40"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <select
              className="w-full p-3 rounded-xl bg-black/40"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option>FOH</option>
              <option>Bar</option>
              <option>Kitchen</option>
              <option>Owner</option>
            </select>

            <button
              onClick={handleLogin}
              className="w-full p-3 bg-orange-500 rounded-xl"
            >
              Enter System
            </button>

            <button
              onClick={() => setShowLogin(false)}
              className="w-full text-white/60 text-sm"
            >
              Cancel
            </button>

          </div>
        </div>
      )}

    </div>
  );
}