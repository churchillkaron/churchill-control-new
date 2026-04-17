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

    // ✅ ONLY LOGIN — NO ATTENDANCE HERE
    localStorage.setItem("staffName", name);
    localStorage.setItem("staffRole", role);

    // ROLE ROUTING
    if (role === "Owner") {
      router.push("/dashboard");
    } else {
      router.push("/staff");
    }
  };

  return (
    <div className="relative min-h-screen text-white flex items-center justify-center overflow-hidden">

      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-30">
        <img
          src="/bg-hero-control.jpg"
          className="w-full h-full object-cover"
        />
      </div>

      <div className="absolute inset-0 -z-20 bg-black/60" />

      {/* HERO */}
      <div className="text-center space-y-6">
        <h1 className="text-5xl font-semibold">
          Churchill Control
        </h1>

        <button
          onClick={() => setShowLogin(true)}
          className="px-8 py-4 bg-orange-500 rounded-xl"
        >
          Get Connected
        </button>
      </div>

      {/* LOGIN */}
      {showLogin && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">

          <div className="bg-white/10 p-8 rounded-3xl w-full max-w-md space-y-4">

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

          </div>
        </div>
      )}

    </div>
  );
}