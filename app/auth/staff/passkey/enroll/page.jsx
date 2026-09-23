"use client";

import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";

import { supabaseClient } from "@/lib/shared/supabase/client";
import verifyClockInPasskey from "@/lib/people/workforce/verifyClockInPasskey";

export default function StaffPasskeyEnrollmentBrokerPage() {
  const [stateToken, setStateToken] = useState("");
  const [context, setContext] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Preparing secure enrollment...");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const state = new URLSearchParams(window.location.search).get("state") || "";
    setStateToken(state);
    if (!state) {
      setError("This passkey enrollment link is incomplete.");
      setStatus("");
      return () => { cancelled = true; };
    }

    Promise.all([
      fetch(`/api/auth/staff/passkey/context?state=${encodeURIComponent(state)}`, {
        credentials: "same-origin",
        cache: "no-store",
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) throw new Error(payload?.error || "Enrollment authorization is invalid or expired.");
        return payload;
      }),
      supabaseClient.auth.getUser(),
    ]).then(([brokerContext, userResult]) => {
      if (userResult?.error || !userResult?.data?.user?.id) {
        throw new Error("Your authenticated staff session did not reach Avantiqo Identity.");
      }
      if (!cancelled) {
        setContext(brokerContext);
        setStatus("Ready to create your passkey");
      }
    }).catch((loadError) => {
      if (!cancelled) {
        setError(loadError?.message || "Unable to prepare passkey enrollment.");
        setStatus("");
      }
    });

    return () => { cancelled = true; };
  }, []);

  async function handoffBack() {
    const {
      data: { session },
      error: sessionError,
    } = await supabaseClient.auth.getSession();
    if (sessionError || !session?.access_token || !session?.refresh_token) {
      throw new Error("Passkey enrollment completed but the authenticated session is unavailable.");
    }

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
  }

  async function enroll() {
    if (!context || !stateToken) return;
    setBusy(true);
    setError("");
    try {
      setStatus("Creating passkey on this device...");
      const { error: registrationError } = await supabaseClient.auth.registerPasskey();
      if (registrationError) throw registrationError;

      setStatus("Verifying the new passkey...");
      await verifyClockInPasskey();

      setStatus("Passkey verified. Returning to your workplace...");
      await handoffBack();
    } catch (enrollmentError) {
      setError(enrollmentError?.message || "Passkey enrollment failed.");
      setStatus("Ready to create your passkey");
      setBusy(false);
    }
  }

  const brandName = context?.brand?.displayName || context?.brand?.name || "Your workplace";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F6F3] px-4 py-8 text-[#1B1A18]">
      <section className="w-full max-w-md rounded-[32px] border border-black/[0.07] bg-white p-6 shadow-[0_24px_70px_rgba(55,47,38,0.08)] sm:p-8">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#D6A66A]">
          <ShieldCheck className="h-4 w-4" />
          Avantiqo Identity
        </div>

        {context?.brand?.logoSrc ? (
          <div className="mt-6 flex justify-center">
            <img src={context.brand.logoSrc} alt={brandName} className="max-h-24 max-w-[240px] object-contain" />
          </div>
        ) : null}

        <h1 className="mt-6 text-center text-2xl font-black tracking-[-0.03em]">
          Create your {brandName} passkey
        </h1>
        <p className="mt-2 text-center text-sm leading-6 text-[#817B73]">
          Face ID, Touch ID or your device PIN protects the credential. Avantiqo never receives your biometric template.
        </p>

        {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-[#984C43]">{error}</div> : null}
        {status ? <div className="mt-5 rounded-2xl border border-black/[0.06] bg-[#FCFBF9] p-4 text-center text-xs font-bold text-[#5E5952]">{status}</div> : null}

        <button
          type="button"
          onClick={enroll}
          disabled={busy || !context || Boolean(error)}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1B1A18] px-4 py-4 text-xs font-black uppercase tracking-[0.12em] text-white disabled:opacity-35"
        >
          <KeyRound className="h-4 w-4" />
          {busy ? "Working..." : "Create and verify passkey"}
        </button>

        <div className="mt-4 text-center text-[10px] leading-4 text-[#948E86]">
          The passkey is permanently bound to avantiqo.ai, while your staff portal can remain on your employer's own domain.
        </div>
      </section>
    </main>
  );
}
