"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
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
    <div className="relative min-h-screen flex items-center justify-center text-white">

      {/* BG */}
      <div className="absolute inset-0 -z-30">
        <img src="/bg-hero-control.jpg" className="w-full h-full object-cover" />
      </div>

      <div className="absolute inset-0 -z-20 bg-black/70" />

      {/* LOGIN */}
      <div className="bg-white/10 backdrop-blur-xl p-8 rounded-3xl border border-white/10 w-full max-w-md">

        <h1 className="text-2xl mb-6">Staff Login</h1>

        <input
          type="text"
          placeholder="Your name"
          className="w-full p-3 mb-4 rounded-xl bg-black/40"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <select
          className="w-full p-3 mb-4 rounded-xl bg-black/40"
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
          Get Connected
        </button>

      </div>
    </div>
  );
}