"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/shared/supabase/client";

function formatCompanyName(hostname) {
  const host = String(hostname || "")
    .toLowerCase()
    .replace(/^www\./, "")
    .split(":")[0];

  if (!host || host === "localhost" || host.endsWith("vercel.app")) return "Churchill";
  if (host.includes("churchill")) return "Churchill";
  if (host.includes("butterfly")) return "Butterfly Bar";
  if (host.includes("coleley") || host.includes("cole-ley")) return "Cole Ley";
  if (host.includes("pestcontrolphuket") || host.includes("pest-control-phuket")) {
    return "Pest Control Phuket";
  }

  const parts = host.split(".").filter(Boolean);
  const label = parts[0] === "app" && parts.length > 2 ? parts[1] : parts[0];

  return String(label || "Organisation")
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-1.99 3.02v2.54h3.23c1.89-1.74 2.98-4.3 2.98-7.41Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.89 6.62-2.41l-3.23-2.54c-.9.6-2.04.95-3.39.95-2.61 0-4.82-1.76-5.61-4.13H3.05v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.87A5.99 5.99 0 0 1 6.08 12c0-.65.11-1.28.31-1.87V7.51H3.05A10 10 0 0 0 2 12c0 1.61.39 3.14 1.05 4.49l3.34-2.62Z" />
      <path fill="#EA4335" d="M12 6c1.47 0 2.79.5 3.83 1.49l2.87-2.87C16.96 3 14.7 2 12 2a10 10 0 0 0-8.95 5.51l3.34 2.62C7.18 7.76 9.39 6 12 6Z" />
    </svg>
  );
}

function AvantiqoIdentity() {
  return (
    <div className="flex flex-col items-center">
      <div className="relative flex h-[148px] w-full items-center justify-center sm:h-[162px]">
        <div className="pointer-events-none absolute h-[100px] w-[180px] rounded-full bg-[#D6A66A]/10 blur-3xl" />
        <img
          src="/app/branding/avantiqo-logo.webp"
          alt="Avantiqo"
          width="320"
          height="220"
          className="relative h-[148px] w-auto max-w-full object-contain drop-shadow-[0_0_34px_rgba(214,166,106,0.28)] sm:h-[162px]"
        />
      </div>

      <div className="mt-1 bg-gradient-to-r from-[#B97A2E] via-[#FFE2A0] to-[#9C6B74] bg-clip-text text-[22px] font-medium uppercase tracking-[0.34em] text-transparent">
        Avantiqo
      </div>
      <div className="mt-2 text-[9px] uppercase tracking-[0.25em] text-white/48">
        Synthetic Intelligence Operating System
      </div>
      <div className="mt-3 text-[9px] uppercase tracking-[0.38em] text-[#D6A66A]/80">
        Create · Operate · Scale
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
    if (typeof window !== "undefined") setHostname(window.location.hostname);

    async function initialiseAuth() {
      const { data } = await supabase.auth.getSession();
      if (mounted && data?.session && typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
        setMode("recovery");
      }
    }

    initialiseAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
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
      options: { redirectTo: `${window.location.origin}/login/callback` },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  }

  const recoveryMode = mode === "recovery";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#030303] px-5 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(214,166,106,0.11),transparent_38%)]" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[38%] opacity-20 [background-image:radial-gradient(circle,rgba(214,166,106,.65)_1px,transparent_1px)] [background-size:12px_12px] [mask-image:linear-gradient(to_right,black,transparent)]" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[38%] opacity-20 [background-image:radial-gradient(circle,rgba(214,166,106,.65)_1px,transparent_1px)] [background-size:12px_12px] [mask-image:linear-gradient(to_left,black,transparent)]" />

      <section className="relative w-full max-w-[510px] rounded-[36px] border border-[#D6A66A]/35 bg-[linear-gradient(145deg,rgba(20,20,20,.97),rgba(5,5,5,.98))] px-7 py-8 shadow-[0_40px_120px_rgba(0,0,0,.75),0_0_80px_rgba(214,166,106,.06)] sm:px-11 sm:py-10">
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#F2C66F] to-transparent" />
        <AvantiqoIdentity />

        <div className="my-7 flex items-center gap-4">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[#D6A66A]/45" />
          <div className="h-1.5 w-1.5 rotate-45 border border-[#E4BC82]/80" />
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[#D6A66A]/45" />
        </div>

        <div className="text-center">
          <h1 className="font-serif text-[34px] font-normal tracking-[0.01em] text-[#F6F1E8]">
            {recoveryMode ? "Create password" : companyName}
          </h1>
          <p className="mt-2 text-[11px] tracking-[0.08em] text-[#D6A66A]/65">
            {recoveryMode ? "Secure your account" : `Secure staff access to ${companyName}`}
          </p>
        </div>

        <div className="mt-7 space-y-4">
          {!recoveryMode && (
            <label className="block">
              <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#D6A66A]/80">Email</span>
              <div className="flex items-center gap-3 rounded-[12px] border border-white/[0.12] bg-black/45 px-4 transition focus-within:border-[#D6A66A]/65 focus-within:shadow-[0_0_24px_rgba(214,166,106,.08)]">
                <Mail className="h-4 w-4 text-white/35" />
                <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") handleManualLogin(); }} placeholder="name@company.com" className="h-12 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/18" />
              </div>
            </label>
          )}

          <label className="block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#D6A66A]/80">{recoveryMode ? "New password" : "Password"}</span>
            <div className="flex items-center gap-3 rounded-[12px] border border-white/[0.12] bg-black/45 px-4 transition focus-within:border-[#D6A66A]/65 focus-within:shadow-[0_0_24px_rgba(214,166,106,.08)]">
              <Lock className="h-4 w-4 text-white/35" />
              <input type="password" autoComplete={recoveryMode ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !recoveryMode) handleManualLogin(); }} placeholder="Enter password" className="h-12 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/18" />
            </div>
          </label>

          {recoveryMode && (
            <label className="block">
              <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#D6A66A]/80">Confirm password</span>
              <div className="flex items-center gap-3 rounded-[12px] border border-white/[0.12] bg-black/45 px-4 transition focus-within:border-[#D6A66A]/65">
                <Lock className="h-4 w-4 text-white/35" />
                <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") handleSetPassword(); }} placeholder="Repeat password" className="h-12 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/18" />
              </div>
            </label>
          )}

          {!recoveryMode && (
            <div className="flex justify-end">
              <button type="button" onClick={handleForgotPassword} disabled={loading} className="text-[12px] text-[#D6A66A] transition hover:text-[#F3D89D] disabled:opacity-50">Forgot password?</button>
            </div>
          )}

          {error && <div className="rounded-xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-xs text-red-300">{error}</div>}
          {message && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-3 text-xs text-emerald-300">{message}</div>}

          <button type="button" onClick={recoveryMode ? handleSetPassword : handleManualLogin} disabled={loading} className="mt-2 flex h-13 w-full items-center justify-center rounded-[12px] border border-[#F0C873] bg-[linear-gradient(100deg,#8E5A20,#E0AE54,#F6D98C,#B9772A)] px-5 py-3.5 text-[12px] font-semibold uppercase tracking-[0.2em] text-black shadow-[inset_0_1px_0_rgba(255,255,255,.42),0_10px_30px_rgba(191,128,45,.18)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? "Please wait" : recoveryMode ? "Save password" : "Log in"}
          </button>

          {!recoveryMode && (
            <>
              <div className="flex items-center gap-4 py-1">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[#D6A66A]/35" />
                <span className="text-[10px] uppercase tracking-[0.22em] text-[#D6A66A]/75">or</span>
                <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[#D6A66A]/35" />
              </div>
              <button type="button" onClick={handleGoogleLogin} disabled={loading} className="flex h-12 w-full items-center justify-center gap-3 rounded-[12px] border border-white/[0.12] bg-white/[0.025] text-sm text-white/75 transition hover:border-[#D6A66A]/35 hover:bg-white/[0.05] hover:text-white disabled:opacity-50">
                <GoogleIcon />
                Continue with Google
              </button>
            </>
          )}
        </div>

        <div className="mt-7 flex items-center justify-center gap-2 text-[9px] uppercase tracking-[0.16em] text-white/25">
          <ShieldCheck className="h-4 w-4 text-[#D6A66A]/55" />
          Secure · Encrypted · Protected
        </div>
        <div className="pointer-events-none absolute inset-x-10 bottom-0 h-px bg-gradient-to-r from-transparent via-[#F2C66F] to-transparent" />
      </section>
    </main>
  );
}
