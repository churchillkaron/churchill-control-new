"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Bot,
  Lock,
  Mail,
} from "lucide-react";

import { supabase } from "@/lib/shared/supabase/client";

const DEV_MODE =
  process.env.NEXT_PUBLIC_DEV_MODE === "true";

export default function LoginPage() {

  const router =
    useRouter();

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  useEffect(() => {

    checkSession();

  }, []);

  async function checkSession() {

    const {
      data: { session },
    } =
      await supabase.auth.getSession();

    // disabled for onboarding testing

  }

  async function handleManualLogin() {

    try {

      setLoading(true);
      setError("");

      const {
        error,
      } =
        await supabase.auth.signInWithPassword({

          email,

          password,

        });

      if (error) {

        setError(
          error.message
        );

        return;
      }

      router.push("/login/callback");

    } catch (err) {

      setError(
        "Login failed"
      );

    } finally {

      setLoading(false);

    }

  }

  async function handleGoogleLogin() {

    await supabase.auth.signInWithOAuth({

      provider: "google",

      options: {

        redirectTo:
          `${window.location.origin}/login/callback`,

      },

    });

  }

  return (

    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 text-white">

      <div className="absolute left-[-120px] top-[-120px] h-[320px] w-[320px] rounded-full bg-fuchsia-500/20 blur-[120px]" />

      <div className="absolute bottom-[-140px] right-[-100px] h-[360px] w-[360px] rounded-full bg-cyan-500/20 blur-[120px]" />

      <div className="relative z-20 w-full max-w-md overflow-hidden rounded-[36px] border border-white/10 bg-black/60 backdrop-blur-3xl">

        <div className="h-[2px] bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400" />

        <div className="p-8">

          <div className="flex justify-center">

            <div className="flex h-16 w-16 items-center justify-center rounded-[28px] bg-gradient-to-br from-fuchsia-500 via-violet-500 to-cyan-400 shadow-[0_0_60px_rgba(217,70,239,0.35)]">

              <Bot className="h-8 w-8 text-white" />

            </div>

          </div>

          <div className="mt-6 text-center">

            <div className="text-[10px] uppercase tracking-[0.35em] text-fuchsia-300">
              Powered by Avantiqo
            </div>

            <h1 className="mt-4 text-4xl font-black">
              Churchill Runtime
            </h1>

            <p className="mt-3 text-sm leading-relaxed text-white/45">
              Luxury hospitality operating system and nightlife intelligence runtime.
            </p>

          </div>

          <div className="mt-8 space-y-4">

            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3">

              <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/40">
                <Mail className="h-4 w-4" />
                Email
              </div>

              <input
                value={email}
                onChange={(e) =>
                  setEmail(
                    e.target.value
                  )
                }
                placeholder="you@churchill.com"
                className="w-full bg-transparent text-white outline-none placeholder:text-white/20"
              />

            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3">

              <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/40">
                <Lock className="h-4 w-4" />
                Password
              </div>

              <input
                type="password"
                value={password}
                onChange={(e) =>
                  setPassword(
                    e.target.value
                  )
                }
                placeholder="••••••••"
                className="w-full bg-transparent text-white outline-none placeholder:text-white/20"
              />

            </div>

            {error && (

              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">

                {error}

              </div>

            )}

            <button
              onClick={
                handleManualLogin
              }
              disabled={loading}
              className="flex h-14 w-full items-center justify-center rounded-[24px] bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400 font-semibold text-white shadow-[0_0_50px_rgba(217,70,239,0.35)]"
            >

              {loading
                ? "Loading..."
                : "Login"}

            </button>

            <div className="relative py-2">

              <div className="absolute inset-0 flex items-center">

                <div className="w-full border-t border-white/10" />

              </div>

              <div className="relative flex justify-center text-[10px] uppercase tracking-[0.25em] text-white/30">

                <span className="bg-black px-4">
                  OR
                </span>

              </div>

            </div>

            <button
              onClick={
                handleGoogleLogin
              }
              className="flex h-14 w-full items-center justify-center rounded-[24px] border border-white/10 bg-white/[0.04] font-semibold text-white transition-all duration-300 hover:bg-white/[0.08]"
            >

              Continue with Google

            </button>

          </div>

        </div>

      </div>

    </div>

  );

}
