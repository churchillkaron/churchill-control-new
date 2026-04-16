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
    <div className="relative min-h-screen text-white flex items-center justify-center overflow-hidden">

      {/* 🔥 BACKGROUND (CINEMATIC) */}
      <div className="absolute inset-0 -z-30 animate-[zoom_20s_ease-in-out_infinite]">
        <img
          src="/bg-hero-control.jpg"
          className="w-full h-full object-cover scale-105"
        />
      </div>

      {/* OVERLAY */}
      <div className="absolute inset-0 -z-20 bg-black/60 backdrop-blur-[2px]" />

      {/* HERO */}
      <div className="text-center space-y-6 animate-fadeIn">

        <h1 className="text-5xl font-semibold tracking-wide">
          Churchill Control
        </h1>

        <p className="text-white/70 text-lg">
          Real-time restaurant intelligence system
        </p>

        {/* 🔥 BUTTON */}
        <button
          onClick={() => setShowLogin(true)}
          className="px-8 py-4 bg-orange-500 rounded-xl text-lg 
          hover:bg-orange-600 transition-all duration-300
          shadow-[0_0_20px_rgba(255,122,0,0.5)] hover:shadow-[0_0_40px_rgba(255,122,0,0.9)]"
        >
          Get Connected
        </button>

      </div>

      {/* 🔥 LOGIN MODAL */}
      {showLogin && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 animate-fadeIn">

          <div className="bg-white/10 backdrop-blur-xl p-8 rounded-3xl border border-white/10 w-full max-w-md space-y-4 animate-slideUp">

            <h2 className="text-xl">Access System</h2>

            <input
              type="text"
              placeholder="Your name"
              className="w-full p-3 rounded-xl bg-black/40 border border-white/10"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <select
              className="w-full p-3 rounded-xl bg-black/40 border border-white/10"
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
              className="w-full p-3 bg-orange-500 rounded-xl hover:bg-orange-600 transition"
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

      {/* 🔥 ANIMATIONS */}
      <style jsx global>{`
        @keyframes zoom {
          0%, 100% { transform: scale(1.05); }
          50% { transform: scale(1.1); }
        }

        .animate-fadeIn {
          animation: fadeIn 1s ease forwards;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .animate-slideUp {
          animation: slideUp 0.4s ease;
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

    </div>
  );
}