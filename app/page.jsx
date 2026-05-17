"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { supabase } from "@/lib/shared/supabase/client";

export default function LoginPage() {

  const router =
    useRouter();

  const [
    mounted,
    setMounted,
  ] = useState(false);

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

  useEffect(() => {

    setMounted(true);

  }, []);

  useEffect(() => {

    if (!mounted) {
      return;
    }

    async function checkSession() {

      const {
        data: { session },
      } =
        await supabase.auth.getSession();

      if (session) {

        router.replace(
          "/dashboard"
        );
      }
    }

    checkSession();

  }, [
    mounted,
    router,
  ]);

  async function handleLogin(
    e
  ) {

    e.preventDefault();

    try {

      setLoading(true);

      const {
        error,
      } = await supabase.auth.signInWithPassword({

        email,

        password,
      });

      if (error) {

        alert(
          error.message
        );

        return;
      }

      router.replace(
        "/dashboard"
      );

    } catch (error) {

      console.error(
        error
      );

      alert(
        "Login failed"
      );

    } finally {

      setLoading(false);
    }
  }

  if (!mounted) {

    return (
      <div className="min-h-screen bg-[#050507]" />
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050507] px-6">

      <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-[#111117] p-8">

        <div className="mb-8">

          <div className="text-[11px] tracking-[0.28em] text-white/30">
            CHURCHILL CONTROL
          </div>

          <div
            className="mt-4 text-5xl text-white"
            style={{
              fontWeight: 250,
              letterSpacing: "-0.08em",
            }}
          >
            Login
          </div>

          <div className="mt-3 text-sm text-white/40">
            Restaurant Operating System
          </div>

        </div>

        <form
          onSubmit={
            handleLogin
          }
          className="space-y-5"
        >

          <div>

            <div className="mb-2 text-sm text-white/50">
              Email
            </div>

            <input
              type="email"
              value={email}
              onChange={(e) =>
                setEmail(
                  e.target.value
                )
              }
              className="w-full rounded-[18px] border border-white/10 bg-black/20 px-5 py-4 text-white outline-none transition focus:border-[#8B5CF6]/40"
              placeholder="Email"
              required
            />

          </div>

          <div>

            <div className="mb-2 text-sm text-white/50">
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
              className="w-full rounded-[18px] border border-white/10 bg-black/20 px-5 py-4 text-white outline-none transition focus:border-[#8B5CF6]/40"
              placeholder="Password"
              required
            />

          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-[18px] bg-[#8B5CF6] px-5 py-4 text-white transition hover:bg-[#9D6BFF] disabled:opacity-40"
          >
            {loading
              ? "SIGNING IN..."
              : "SIGN IN"}
          </button>

        </form>

      </div>

    </div>
  );
}
