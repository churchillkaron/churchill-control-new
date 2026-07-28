"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail } from "lucide-react";
import { supabase } from "@/lib/shared/supabase/client";

function formatCompanyName(hostname) {
  const host = String(hostname || "")
    .toLowerCase()
    .replace(/^www\./, "")
    .split(":")[0];

  if (!host || host === "localhost" || host.endsWith("vercel.app")) {
    return "Churchill";
  }

  if (host.includes("churchill")) return "Churchill";
  if (host.includes("butterfly")) return "Butterfly Bar";
  if (host.includes("coleley") || host.includes("cole-ley")) return "Cole Ley";
  if (host.includes("pestcontrolphuket") || host.includes("pest-control-phuket")) {
    return "Pest Control Phuket";
  }

  const parts = host.split(".").filter(Boolean);
  const label = parts[0] === "app" && parts.length > 2 ? parts[1] : parts[0];

  return String(label || "Organization")
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function AvantiqoMark() {
  return (
    <div className="flex flex-col items-center">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-[#D6A66A]/45 bg-[#D6A66A]/[0.05] shadow-[0_0_35px_rgba(214,166,106,0.08)]">
        <svg
          aria-hidden="true"
          viewBox="0 0 64 64"
          className="h-8 w-8"
          fill="none"
        >
          <path
            d="M12 48 30.5 14a2 2 0 0 1 3.5 0L52 48"
            stroke="#D6A66A"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M21.5 39h21"
            stroke="#D6A66A"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path
            d="M32 21v27"
            stroke="#F2DEC0"
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.9"
          />
        </svg>
      </div>
      <div className="mt-4 text-[13px] font-medium uppercase tracking-[0.42em] text-[#E7C99D]">
        Avantiqo
      </div>
      <div className="mt-1 text-[9px] uppercase tracking-[0.25em] text-white/30">
        Business Operating System
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [hostname, setHostname] = useState("");

  const companyName = useMemo(() => formatCompanyName(hostname), [hostname]);

  useEffect(() => {
    let mounted = true;

    if (typeof window !== "undefined") {
      setHostname(window.location.hostname);
    }

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          hostname: typeof window !== "undefined" ? window.location.hostname : "",
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.error || "Unable to send the password email.");
        return;
      }

      setMessage("Check your email for a secure link to create or reset your password.");
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

      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setMessage("Password saved successfully. Opening your workspace...");
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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070707] px-5 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-15%,rgba(214,166,106,0.08),transparent_38%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D6A66A]/55 to-transparent" />

      <section className="relative w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <AvantiqoMark />
          <div className="mx-auto mt-7 h-px w-16 bg-[#D6A66A]/35" />
          <h1 className="mt-6 text-[28px] font-light tracking-[0.02em] text-white">
            {recoveryMode ? "Create password" : companyName}
          </h1>
          <p className="mt-2 text-[12px] tracking-[0.08em] text-white/35">
            {recoveryMode ? "Secure your account" : "Authorised staff access"}
          </p>
        </div>

        <div className="rounded-[26px] border border-white/[0.08] bg-[#0D0D0D]/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-7">
          <div className="space-y-4">
            {!recoveryMode && (
              <label className="block">
                <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-white/35">
                  Email
                </span>
                <div className="flex items-center gap-3 rounded-[14px] border border-white/[0.09] bg-black/35 px-4 transition focus-within:border-[#D6A66A]/50">
                  <Mail className="h-4 w-4 text-[#D6A66A]/65" />
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") handleManualLogin();
                    }}
                    placeholder="name@company.com"
                    className="h-12 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/20"
                  />
                </div>
              </label>
            )}

            <label className="block">
              <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-white/35">
                {recoveryMode ? "New password" : "Password"}
              </span>
              <div className="flex items-center gap-3 rounded-[14px] border border-white/[0.09] bg-black/35 px-4 transition focus-within:border-[#D6A66A]/50">
                <Lock className="h-4 w-4 text-[#D6A66A]/65" />
                <input
                  type="password"
                  autoComplete={recoveryMode ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !recoveryMode) handleManualLogin();
                  }}
                  placeholder="Enter password"
                  className="h-12 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/20"
                />
              </div>
            </label>

            {recoveryMode && (
              <label className="block">
                <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-white/35">
                  Confirm password
                </span>
                <div className="flex items-center gap-3 rounded-[14px] border border-white/[0.09] bg-black/35 px-4 transition focus-within:border-[#D6A66A]/50">
                  <Lock className="h-4 w-4 text-[#D6A66A]/65" />
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") handleSetPassword();
                    }}
                    placeholder="Repeat password"
                    className="h-12 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/20"
                  />
                </div>
              </label>
            )}

            {!recoveryMode && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={loading}
                  className="text-[12px] text-[#D6A66A]/80 transition hover:text-[#F2DEC0] disabled:opacity-50"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-xs text-red-300">
                {error}
              </div>
            )}

            {message && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-3 text-xs text-emerald-300">
                {message}
              </div>
            )}

            <button
              type="button"
              onClick={recoveryMode ? handleSetPassword : handleManualLogin}
              disabled={loading}
              className="mt-1 flex h-12 w-full items-center justify-center rounded-[14px] border border-[#D6A66A]/55 bg-[#D6A66A] text-[11px] font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-[#E4BC82] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Please wait" : recoveryMode ? "Save password" : "Login"}
            </button>

            {!recoveryMode && (
              <>
                <div className="flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-white/[0.07]" />
                  <span className="text-[9px] uppercase tracking-[0.22em] text-white/20">or</span>
                  <div className="h-px flex-1 bg-white/[0.07]" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="flex h-12 w-full items-center justify-center gap-3 rounded-[14px] border border-white/[0.09] bg-white/[0.025] text-sm text-white/70 transition hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-bold text-black">
                    G
                  </span>
                  Continue with Google
                </button>
              </>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-[9px] uppercase tracking-[0.18em] text-white/20">
          Protected by Avantiqo Identity
        </p>
      </section>
    </main>
  );
}
