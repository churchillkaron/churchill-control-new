"use client";

import { useState } from "react";

export default function Home() {
  const [showLogin, setShowLogin] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  const roles = [
    "FOH",
    "BAR",
    "KITCHEN",
    "MANAGER",
    "ACCOUNTING",
    "OWNER",
  ];

  const handleLogin = () => {
    if (!name || !role) {
      alert("Enter name and select role");
      return;
    }

    localStorage.setItem("staffName", name);
    localStorage.setItem("staffRole", role);

    // 🔥 ROLE ROUTING
    if (role === "FOH") window.location.href = "/pos";
    else if (role === "BAR") window.location.href = "/pos-control";
    else if (role === "KITCHEN") window.location.href = "/pos-control";
    else if (role === "MANAGER") window.location.href = "/dashboard";
    else if (role === "ACCOUNTING") window.location.href = "/accounting";
    else if (role === "OWNER") window.location.href = "/dashboard";
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center text-white">

      {/* 🔥 YOUR EXISTING LANDING (KEEP DESIGN) */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div className="relative z-10 text-center space-y-6">

        <h1 className="text-5xl font-semibold">
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

      {/* 🔥 LOGIN MODAL */}
      {showLogin && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/80 z-50">

          <div className="bg-white/[0.08] backdrop-blur-xl p-8 rounded-3xl w-full max-w-md space-y-6 border border-white/10">

            <h2 className="text-xl text-white/90">
              Staff Login
            </h2>

            <input
              placeholder="Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3 rounded-xl bg-black/40 border border-white/10"
            />

            <div className="grid grid-cols-2 gap-3">
              {roles.map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`p-3 rounded-xl text-sm ${
                    role === r
                      ? "bg-[#ff7a00] text-black"
                      : "bg-white/10"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <button
              onClick={handleLogin}
              className="w-full p-3 bg-[#ff7a00] text-black rounded-xl font-medium"
            >
              Enter System
            </button>

            <button
              onClick={() => setShowLogin(false)}
              className="w-full text-white/40 text-sm"
            >
              Cancel
            </button>

          </div>
        </div>
      )}

    </div>
  );
}