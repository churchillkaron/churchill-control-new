"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [user, setUser] = useState("");

  const users = [
    { name: "Patric", role: "owner", salary: 0 },
    { name: "Anton", role: "gm", salary: 35000 },
    { name: "Poupee", role: "manager", salary: 25000 },
    { name: "Dar Dar", role: "accounting", salary: 0 },
    { name: "Sara", role: "kitchen", salary: 0 },
  ];

  const handleLogin = () => {
    const selected = users.find((u) => u.name === user);
    if (!selected) return;

    localStorage.setItem("current_user", JSON.stringify(selected));

    // 🔥 ROLE ROUTING
    if (selected.role === "owner") router.push("/dashboard");
    else if (selected.role === "accounting") router.push("/accounting");
    else router.push("/staff");
  };

  return (
    <div className="h-screen flex items-center justify-center bg-black text-white">
      <div className="space-y-6 w-[300px]">

        <h1 className="text-2xl text-center">Churchill Login</h1>

        <select
          value={user}
          onChange={(e) => setUser(e.target.value)}
          className="w-full p-2 bg-white/10 rounded"
        >
          <option value="">Select User</option>
          {users.map((u) => (
            <option key={u.name} value={u.name}>
              {u.name} ({u.role})
            </option>
          ))}
        </select>

        <button
          onClick={handleLogin}
          className="w-full bg-[#ff7a00] p-2 rounded"
        >
          Enter System
        </button>

      </div>
    </div>
  );
}