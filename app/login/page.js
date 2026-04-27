"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);

    try {
      await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/marketing/design`,
        },
      });

      alert("Check your email for login link");
    } catch (error) {
      console.error(error);
      alert("Login failed");
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="mb-6 text-2xl font-light">Login</h1>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-xl bg-white/10 p-3 outline-none"
        />

        <button
          onClick={signIn}
          disabled={loading}
          className="w-full rounded-xl bg-orange-500 py-3 text-black"
        >
          {loading ? "Sending..." : "Send Login Link"}
        </button>
      </div>
    </div>
  );
}