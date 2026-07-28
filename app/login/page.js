"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Lock, Mail } from "lucide-react";
import { supabase } from "@/lib/shared/supabase/client";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function initialiseAuth() {
      const { data } = await supabase.auth.getSession();

      if (
        mounted &&
        data?.session &&
        typeof window !== "undefined" &&
        window.location.hash.includes("type=recovery")
      ) {
        setMode("recovery");
      }
    }

    initialiseAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (mounted && event === "PASSWORD_RECOVERY") {
        setMode("recovery");
        setError("");
        setMessage("Choose your new password.");
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  async function handleManualLogin() {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setMessage("");

      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (loginError) {
        setError(loginError.message);
        return;
      }

      router.push("/login/callback");
    } catch {
      setError("Login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setError("Enter your registered email first.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setMessage("");

      const response = await fetch("/api/auth/activate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.error || "Unable to send the password email.");
        return;
      }

      setMessage(
        "Check your email for a secure link to create or reset your password."
      );
    } catch {
      setError("Unable to send the password email.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPassword() {
    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setMessage("");

      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setMessage("Password saved successfully. Opening Churchill Runtime...");
      router.replace("/login/callback");
    } catch {
      setError("Unable to save the new password.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setLoading(true);
    setError("");
    setMessage("");

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/login/callback`,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  }

  const recoveryMode = mode === "recovery";

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
              {recoveryMode ? "Create Password" : "Churchill Runtime"}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-white/45">
              {recoveryMode
                ? "Choose the password you will use for future logins."
                : "Secure staff access to the Churchill operating system."}
            </p>
          </div>

          <div className="mt-8 space-y-4">
            {!recoveryMode && (
              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3">
                <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/40">
                  <Mail className="h-4 w-4" />
                  Email
                </div>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleManualLogin();
                  }}
                  placeholder="you@churchill.com"
                  className="w-full bg-transparent text-white outline-none placeholder:text-white/20"
                />
              </div>
            )}

            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/40">
                <Lock className="h-4 w-4" />
                {recoveryMode ? "New password" : "Password"}
              </div>
              <input
                type="password"
                autoComplete={recoveryMode ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !recoveryMode) handleManualLogin();
                }}
                placeholder="••••••••"
                className="w-full bg-transparent text-white outline-none placeholder:text-white/20"
              />
            </div>

            {recoveryMode && (
              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3">
                <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/40">
                  <Lock className="h-4 w-4" />
                  Confirm password
                </div>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleSetPassword();
                  }}
                  placeholder="••••••••"
                  className="w-full bg-transparent text-white outline-none placeholder:text-white/20"
                />
              </div>
            )}

            {!recoveryMode && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={loading}
                  className="text-sm text-fuchsia-200 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {message && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                {message}
              </div>
            )}

            <button
              type="button"
              onClick={recoveryMode ? handleSetPassword : handleManualLogin}
              disabled={loading}
              className="flex h-14 w-full items-center justify-center rounded-[24px] bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400 font-semibold text-white shadow-[0_0_50px_rgba(217,70,239,0.35)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? "Please wait..."
                : recoveryMode
                  ? "Save Password"
                  : "Login"}
            </button>

            {!recoveryMode && (
              <>
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10" />
                  </div>
                  <div className="relative flex justify-center text-[10px] uppercase tracking-[0.25em] text-white/30">
                    <span className="bg-black px-4">OR</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="flex h-14 w-full items-center justify-center rounded-[24px] border border-white/10 bg-white/[0.04] font-semibold text-white transition-all duration-300 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Continue with Google
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
