"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [name, setName] = useState("");
  const router = useRouter();

  const handleLogin = () => {
    if (!name) return;

    // save user locally
    localStorage.setItem("staffName", name);

    router.push("/control-final");
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center text-white">

      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-30">
        <img
          src="/bg-hero-control.jpg"
          className="w-full h-full object-cover"
        />
      </div>

      <div className="absolute inset-0 -z-20 bg-black/70" />

      {/* LOGIN BOX */}
      <div className="bg-white/10 backdrop-blur-xl p-8 rounded-3xl border border-white/10 w-full max-w-md">

        <h1 className="text-2xl mb-6">Staff Login</h1>

        <input
          type="text"
          placeholder="Enter your name"
          className="w-full p-3 rounded-xl bg-black/40 border border-white/10 mb-4"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

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