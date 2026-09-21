"use client";

import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";

import { supabaseClient } from "@/lib/shared/supabase/client";

export default function StaffPasskeyBrokerPage() {
  const [stateToken, setStateToken] = useState("");
  const [context, setContext] = useState(null);
  const [status, setStatus] = useState("Loading secure sign-in...");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const state = new URLSearchParams(window.location.search).get("state") || "";
    setStateToken(state);

    if (!state) {
      setError("This staff sign-in link is incomplete.");
      setStatus("");
      return () => { cancelled = true; };
    }

    fetch(`/api/auth/staff/passkey/context?state=${encodeURIComponent(state)}`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || "This staff sign-in link is invalid or expired.");
        }
        if (!cancelled) {
          setContext(payload);
          setStatus("Ready for Face ID / Touch ID");
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError?.message || "Unable to prepare staff passkey sign-in.");
          setStatus("");
        }
      });

    return () => { cancelled = true; };
  }, []);

  async function continueWithPasskey() {
    if (!context?.returnOrigin || !stateToken) return;
    setBusy(true);
    setError("");
    setStatus("Waiting for Face ID / Touch ID...");

    try {
      const { error: signInError } = await supabaseClient.auth.signInWithPasskey();
      if (signInError) throw signInError;

      const {
        data: { session },
        error: sessionError,
      } = await supabaseClient.auth.getSession();

      if (sessionError || !session?.access_token || !session?.refresh_token) {
        throw new Error("Passkey succeeded but no authenticated session was created.");
      }

      setStatus("Securely returning to your workplace...");
      const form = document.createElement("form");
      form.method = "POST";
      form.action = `${context.returnOrigin}/api/auth/staff/passkey/complete`;
      form.style.display = "none";

      const fields = {
        state: stateToken,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      };

      for (const [name, value] of Object.entries(fields)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }

      document.body.appendChild(form);
      form.submit();
    } catch (passkeyError) {
      setError(passkeyError?.message || "Passkey sign-in failed.");
      setStatus("Ready for Face ID / Touch ID");
      setBusy(false);
    }
  }

  const brandName = context?.brand?.displayName || context?.brand?.name || "Your workplace";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F6F3] px-4 py-8 text-[#1B1A18]">
      <section className="w-full max-w-md rounded-[32px] border border-black/[0.07] bg-white p-6 shadow-[0_24px_70px_rgba(55,47,38,0.08)] sm:p-8">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#D6A66A]">
          <ShieldCheck className="h-4 w-4" />
          Secure staff identity
        </div>

        {context?.brand?.logoSrc ? (
          <div className="mt-6 flex justify-center">
            <img
              src={context.brand.logoSrc}
              alt={brandName}
              className="max-h-24 max-w-[240px] object-contain"
            />
          </div>
        ) : null}

        <h1 className="mt-6 text-center text-2xl font-black tracking-[-0.03em]">
          {brandName}
        </h1>
        <p className="mt-2 text-center text-sm leading-6 text-[#817B73]">
          Use the passkey stored on this device. Your face or fingerprint stays on the device; Avantiqo receives only the cryptographic proof.
        </p>

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-[#984C43]">
            {error}
          </div>
        ) : null}

        {status ? (
          <div className="mt-5 rounded-2xl border border-black/[0.06] bg-[#FCFBF9] p-4 text-center text-xs font-bold text-[#5E5952]">
            {status}
          </div>
        ) : null}

        <button
          type="button"
          onClick={continueWithPasskey}
          disabled={busy || !context || Boolean(error)}
          className="mt-5 flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#1B1A18] px-4 py-4 text-xs font-black uppercase tracking-[0.12em] text-white disabled:opacity-35"
        >
          <KeyRound className="h-4 w-4" />
          {busy ? "Authenticating..." : "Continue with Face ID / passkey"}
        </button>

        <div className="mt-4 text-center text-[10px] leading-4 text-[#948E86]">
          Protected by Avantiqo Identity · Return destination is verified before sign-in completes.
        </div>
      </section>
    </main>
  );
}
