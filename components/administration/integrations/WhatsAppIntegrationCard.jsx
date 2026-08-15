"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";

function loadFacebookSdk({ appId, version }) {
  return new Promise((resolve, reject) => {
    const initialize = () => {
      if (!window.FB) {
        reject(new Error("Meta connection service did not load"));
        return;
      }
      window.FB.init({ appId, cookie: true, xfbml: false, version });
      resolve(window.FB);
    };

    if (window.FB) {
      initialize();
      return;
    }

    const existing = document.getElementById("facebook-jssdk");
    if (existing) {
      existing.addEventListener("load", initialize, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    window.fbAsyncInit = initialize;
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

function normalizeEmbeddedSignupSession(payload) {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
  return {
    waba_id:
      data.waba_id ||
      data.wabaId ||
      data.whatsapp_business_account_id ||
      data.whatsappBusinessAccountId ||
      null,
    phone_number_id:
      data.phone_number_id ||
      data.phoneNumberId ||
      data.whatsapp_business_phone_number_id ||
      data.whatsappBusinessPhoneNumberId ||
      null,
    business_id:
      data.business_id ||
      data.businessId ||
      data.business_manager_id ||
      data.businessManagerId ||
      null,
  };
}

function isFinishEvent(payload) {
  if (payload?.type !== "WA_EMBEDDED_SIGNUP") return false;
  const event = String(payload?.event || "").trim().toUpperCase();
  return event === "FINISH" || event === "FINISH_ONLY_WABA";
}

export default function WhatsAppIntegrationCard({ organizationId }) {
  const [snapshot, setSnapshot] = useState(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const signupRef = useRef({ code: null, accessToken: null, session: null, completing: false });

  async function load() {
    if (!organizationId) return;
    const response = await fetch(
      `/api/administration/integrations/whatsapp?organizationId=${encodeURIComponent(organizationId)}`,
      { cache: "no-store" },
    );
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || "Unable to load WhatsApp Business");
    }
    setSnapshot(data);
  }

  async function completeIfReady() {
    const current = signupRef.current;
    if (
      current.completing ||
      (!current.code && !current.accessToken) ||
      !current.session?.waba_id
    ) {
      return;
    }

    current.completing = true;
    setWorking(true);
    setError("");

    try {
      const response = await fetch("/api/administration/integrations/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          action: "complete-embedded-signup",
          code: current.code,
          accessToken: current.accessToken,
          phoneNumberId: current.session.phone_number_id || null,
          wabaId: current.session.waba_id,
          businessId: current.session.business_id || null,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "WhatsApp Business connection failed");
      }

      setSnapshot(data);
      setNotice("WhatsApp Business connected and inbound messaging is operational.");
      signupRef.current = {
        code: null,
        accessToken: null,
        session: null,
        completing: false,
      };
    } catch (actionError) {
      signupRef.current.completing = false;
      setError(actionError?.message || "WhatsApp Business connection failed");
    } finally {
      setWorking(false);
    }
  }

  useEffect(() => {
    load().catch((loadError) =>
      setError(loadError?.message || "Unable to load WhatsApp Business"),
    );
  }, [organizationId]);

  useEffect(() => {
    function onMessage(event) {
      if (!String(event.origin || "").endsWith("facebook.com")) return;

      let payload = event.data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }

      if (!isFinishEvent(payload)) return;

      const session = normalizeEmbeddedSignupSession(payload);
      if (!session.waba_id) {
        setError("Meta finished WhatsApp setup but did not return the WhatsApp Business Account ID. Please reopen setup and try again.");
        return;
      }

      signupRef.current.session = session;
      completeIfReady();
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [organizationId]);

  async function startEmbeddedSignup() {
    if (!snapshot?.publicConfig?.ready) return;
    setError("");
    setNotice("");
    signupRef.current = {
      code: null,
      accessToken: null,
      session: null,
      completing: false,
    };

    try {
      const FB = await loadFacebookSdk({
        appId: snapshot.publicConfig.appId,
        version: snapshot.publicConfig.graphVersion,
      });

      FB.login(
        (response) => {
          const code = response?.authResponse?.code || null;
          const accessToken = response?.authResponse?.accessToken || null;

          if (!code && !accessToken) {
            setError("WhatsApp connection was cancelled or did not complete.");
            return;
          }

          signupRef.current.code = code;
          signupRef.current.accessToken = accessToken;
          completeIfReady();
        },
        {
          config_id: snapshot.publicConfig.configId,
          response_type: "code",
          override_default_response_type: true,
          extras: {
            setup: {},
            sessionInfoVersion: "3",
          },
        },
      );
    } catch (sdkError) {
      setError(sdkError?.message || "Unable to start WhatsApp connection");
    }
  }

  const connected = snapshot?.connection?.status === "ACTIVE";
  const webhookSubscribed = snapshot?.connection?.webhookSubscribed === true;
  const operational = connected && webhookSubscribed;
  const phone = snapshot?.phoneNumbers?.[0] || null;

  return (
    <main className="min-h-screen bg-black p-6 text-white lg:p-10">
      <div className="mx-auto max-w-4xl">
        <a
          href={`/workspace/${encodeURIComponent(organizationId)}/administration/integrations`}
          className="text-sm text-[#D6A66A]"
        >
          ← Integrations
        </a>

        <div className="mt-8 rounded-[30px] border border-white/10 bg-white/[0.025] p-6 lg:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-white/30">Messaging</div>
              <h1 className="mt-2 text-4xl font-light">WhatsApp Business</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">
                Connect the WhatsApp Business account this organization uses for customer conversations and notifications.
              </p>
            </div>
            <div className={`rounded-full border px-3 py-1 text-xs ${operational ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : connected ? "border-amber-400/20 bg-amber-400/10 text-amber-100" : "border-white/10 bg-white/[0.04] text-white/50"}`}>
              {operational ? "Operational" : connected ? "Reconnect required" : "Not connected"}
            </div>
          </div>

          {(error || notice) && (
            <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${error ? "border-red-400/20 bg-red-400/10 text-red-100" : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"}`}>
              {error || notice}
            </div>
          )}

          {connected ? (
            <div className={`mt-6 rounded-2xl border p-5 ${operational ? "border-emerald-400/15 bg-emerald-400/[0.06]" : "border-amber-400/20 bg-amber-400/[0.06]"}`}>
              <div className={`flex items-center gap-2 ${operational ? "text-emerald-200" : "text-amber-100"}`}>
                {operational ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                <span className="font-medium">
                  {operational ? "WhatsApp messaging is operational" : "This connection does not have the Communications webhook subscription"}
                </span>
              </div>
              <div className="mt-3 text-sm text-white/55">
                {phone?.name || snapshot?.connection?.accountLabel || "Connected WhatsApp Business account"}
              </div>
              {phone?.displayPhoneNumber ? (
                <div className="mt-1 text-xs text-white/35">{phone.displayPhoneNumber}</div>
              ) : null}
              {!operational ? (
                <div className="mt-4 text-xs leading-5 text-amber-50/75">
                  Reconnect this WhatsApp Business account with Embedded Signup. Avantiqo will subscribe and verify the WABA webhook automatically before reporting success.
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => load().catch((e) => setError(e?.message || "Refresh failed"))}
                className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-medium text-white/70"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh connection
              </button>
            </div>
          ) : snapshot?.publicConfig?.ready ? (
            <button
              type="button"
              onClick={startEmbeddedSignup}
              disabled={working}
              className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black disabled:opacity-50"
            >
              {working ? "Connecting…" : "Connect WhatsApp Business"}
              <ExternalLink className="h-4 w-4" />
            </button>
          ) : (
            <div className="mt-6 rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] p-5 text-sm text-amber-100/75">
              WhatsApp Business connection requires the Meta app, Embedded Signup configuration, a public HTTPS Avantiqo URL, and the server-only webhook verification token.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
