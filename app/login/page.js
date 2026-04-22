"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");

  async function signIn() {
    await supabase.auth.signInWithOtp({
      email,
    });

    alert("Check your email for login link");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">

      <div className="w-80">
        <h1 className="text-2xl mb-6">Login</h1>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 mb-4 bg-white/10 rounded"
        />

        <button
          onClick={signIn}
          className="w-full bg-orange-500 text-black py-3 rounded"
        >
          Send Login Link
        </button>
      </div>

    </div>
  );
}