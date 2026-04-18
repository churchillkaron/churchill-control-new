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
    if (!name || !role) return;

    localStorage.setItem("staffName", name);
    localStorage.setItem("staffRole", role);

    if (role === "FOH") window.location.href = "/pos";
    else if (role === "BAR") window.location.href = "/kitchen";
    else if (role === "KITCHEN") window.location.href = "/kitchen";
    else if (role === "MANAGER") window.location.href = "/dashboard";
    else if (role === "ACCOUNTING") window.location.href = "/accounting";
    else if (role === "OWNER") window.location.href = "/control-final";
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center text-white">

      {/* HERO BACKGROUND */}
      <div
        className="fixed inset-0 z-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/bg-hero-control.jpg')" }}
      />
      <div className="fixed inset-0 z-0 bg-black/70" />

      {/* CONTENT */}
      <div className="relative z-10 text-center space-y-6">
        <h1 className="text-5xl font-semibold">
          Churchill Control System
        </h1>

        <button
          onClick={() => setShowLogin(true)}
          className="bg-[#ff7a00] px-8 py-3 rounded-xl text-black"
        >
          Access System
        </button>
      </div>

      {/* LOGIN MODAL */}
      {showLogin && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/80 z-50">

          <div className="bg-white/10 p-8 rounded-2xl w-[320px] space-y-4">

            <h2 className="text-lg">Login</h2>

            <input
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 bg-black/50 rounded"
            />

            <div className="grid grid-cols-2 gap-2">
              {roles.map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`p-2 rounded ${
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
              className="w-full bg-[#ff7a00] py-2 rounded text-black"
            >
              Enter
            </button>

          </div>

        </div>
      )}
    </div>
  );
}