"use client";

import { useState } from "react";
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

    // ✅ unified roles
    if (role === "staff") router.push("/pos");
    if (role === "manager") router.push("/dashboard");
    if (role === "accounting") router.push("/accounting");
    if (role === "owner") router.push("/control-final");
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center text-white">

      <div className="text-center space-y-6">
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

      {showLogin && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/80">

          <div className="bg-white/10 p-8 rounded-2xl w-[320px] space-y-4">

            <h2 className="text-lg">Login</h2>

            <input
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 bg-black/50 rounded"
            />

            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full p-2 bg-black/50 rounded"
            >
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
              <option value="accounting">Accounting</option>
              <option value="owner">Owner</option>
            </select>

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