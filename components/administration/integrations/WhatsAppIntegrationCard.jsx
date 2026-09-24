"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

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
  return (
    event === "FINISH" ||
    event === "FINISH_ONLY_WABA" ||
    event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"
  );
}

export default function WhatsAppIntegrationCard({ organizationId, onboarding = false }) {
  const [snapshot, setSnapshot] = useState(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingCredentialId, setPendingCredentialId] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [selectedWabaId, setSelectedWabaId] = useState("");
  const [selectedPhoneId, setSelectedPhoneId] = useState("");
  const signupRef = useRef({
    code: null,
    accessToken: null,
    session: null,
    recovering: false,
    mode: null,
  });

  const load = useCallback(async () => {
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
  }, [organizationId]);

  async function validateConnection() {
    if (!organizationId || working) return;
    setWorking(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/administration/integrations/whatsapp/validate?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "WhatsApp connection validation failed");
      }

      const validation = data.validation || {};
      await load();

      if (!validation.healthy) {
        throw new Error(
          validation.message || "WhatsApp connection is not healthy in Meta",
        );
      }

      setNotice(
        "WhatsApp connection verified with Meta. Token, phone number, business account, and webhook are healthy.",
      );
    } catch (validationError) {
      setError(
        validationError?.message || "WhatsApp connection validation failed",
      );
    } finally {
      setWorking(false);
    }
  }

  const recoverIfReady = useCallback(async () => {
    const current = signupRef.current;
    if (
      current.recovering ||
      (!current.code && !current.accessToken) ||
      (!current.session?.waba_id && !current.accessToken)
    ) {
      return;
    }

    current.recovering = true;
    setWorking(true);
    setError("");

    try {
      const response = await fetch("/api/administration/integrations/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          action: "recover-existing-embedded-signup",
          code: current.code,
          accessToken: current.accessToken,
          wabaId: current.session?.waba_id || null,
          phoneNumberId: current.session?.phone_number_id || null,
          onboardingMode: current.mode || null,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to discover WhatsApp Business assets");
      }

      const rows = Array.isArray(data.candidates) ? data.candidates : [];
      if (!data.pendingCredentialId || !rows.length) {
        throw new Error("Meta authorization succeeded but no WhatsApp Business assets were returned");
      }

      setPendingCredentialId(data.pendingCredentialId);
      setCandidates(rows);

      const firstWaba = rows[0] || null;
      const firstPhone = firstWaba?.phones?.[0] || null;
      setSelectedWabaId(firstWaba?.id || "");
      setSelectedPhoneId(firstPhone?.id || "");
      setNotice(
        "WhatsApp Business assets found. Confirm the exact account and phone number below before Avantiqo attaches anything to this organization.",
      );
    } catch (actionError) {
      setError(actionError?.message || "Unable to discover WhatsApp Business assets");
    } finally {
      signupRef.current.recovering = false;
      setWorking(false);
    }
  }, [organizationId]);

  async function confirmSelection() {
    if (!pendingCredentialId || !selectedWabaId || !selectedPhoneId) return;
    setWorking(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/administration/integrations/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          action: "confirm-existing-selection",
          pendingCredentialId,
          wabaId: selectedWabaId,
          phoneNumberId: selectedPhoneId,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "WhatsApp Business connection failed");
      }

      setSnapshot(data);
      setPendingCredentialId(null);
      setCandidates([]);
      setSelectedWabaId("");
      setSelectedPhoneId("");
      setNotice("WhatsApp Business connected and inbound messaging is operational.");
    } catch (actionError) {
      setError(actionError?.message || "WhatsApp Business connection failed");
    } finally {
      setWorking(false);
    }
  }

  useEffect(() => {
    load().catch((loadError) =>
      setError(loadError?.message || "Unable to load WhatsApp Business"),
    );
  }, [load]);

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

      signupRef.current.session = normalizeEmbeddedSignupSession(payload);
      recoverIfReady();
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [recoverIfReady]);

  async function startEmbeddedSignup(mode) {
    if (!snapshot?.publicConfig?.ready) return;

    if (window.location.protocol !== "https:") {
      const secureUrl = snapshot?.publicConfig?.secureSetupUrl;
      if (!secureUrl) {
        setError("Meta WhatsApp setup requires a secure HTTPS Avantiqo URL.");
        return;
      }
      window.location.assign(secureUrl);
      return;
    }

    const coexistence = mode === "coexistence";

    setError("");
    setNotice("");
    setPendingCredentialId(null);
    setCandidates([]);
    setSelectedWabaId("");
    setSelectedPhoneId("");
    signupRef.current = {
      code: null,
      accessToken: null,
      session: null,
      recovering: false,
      mode,
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
            setError("Meta authorization was cancelled or did not complete.");
            return;
          }

          signupRef.current.code = code;
          signupRef.current.accessToken = accessToken;
          recoverIfReady();
        },
        {
          config_id: snapshot.publicConfig.configId,
          response_type: "code",
          override_default_response_type: true,
          extras: {
            setup: {},
            ...(coexistence
              ? { featureType: "whatsapp_business_app_onboarding" }
              : {}),
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
  const selectedWaba =
    candidates.find((row) => row.id === selectedWabaId) || candidates[0] || null;
  const selectablePhones = Array.isArray(selectedWaba?.phones)
    ? selectedWaba.phones
    : [];

  if (onboarding) {
    return (
      <main className="min-h-screen bg-[#F7F6F3] p-6 text-[#2D2822] lg:p-10">
        <div className="mx-auto max-w-4xl">
          <a href={`/workspace/${encodeURIComponent(organizationId)}/administration/communications-setup?onboarding=1`} className="text-[9px] font-semibold text-[#8A633C]">← Communication setup</a>
          <section className="mt-5 rounded-[24px] border border-black/[0.07] bg-white p-6 lg:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#A37849]">Messaging</div>
                <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em]">WhatsApp Business</h1>
                <p className="mt-2 max-w-2xl text-[10px] leading-5 text-[#777169]">Authorize the WhatsApp Business account this organization already owns. Avantiqo handles the webhook and technical connection.</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[8px] font-semibold ${operational ? "bg-emerald-50 text-emerald-700" : connected ? "bg-amber-50 text-amber-700" : "bg-[#F0E7DA] text-[#8A633C]"}`}>{operational ? "Operational" : connected ? "Review" : "Not connected"}</span>
            </div>

            {error ? <div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{error}</div> : null}
            {notice ? <div className="mt-4 rounded-xl border border-emerald-700/15 bg-emerald-50 px-4 py-3 text-[10px] text-emerald-800">{notice}</div> : null}

            {pendingCredentialId && candidates.length ? (
              <div className="mt-5 rounded-2xl border border-[#C9AD89]/25 bg-[#FBF6EF] p-5">
                <div className="text-[11px] font-semibold text-[#5C4731]">Confirm the exact WhatsApp assets</div>
                <p className="mt-1 text-[9px] leading-4 text-[#817566]">Nothing is attached until you confirm the business account and phone number.</p>
                <label className="mt-4 block text-[9px] font-semibold text-[#6C6258]">WhatsApp Business Account</label>
                <select value={selectedWabaId} onChange={(event) => { const nextWabaId = event.target.value; const nextWaba = candidates.find((row) => row.id === nextWabaId); setSelectedWabaId(nextWabaId); setSelectedPhoneId(nextWaba?.phones?.[0]?.id || ""); }} className="mt-2 h-10 w-full rounded-xl border border-black/[0.08] bg-white px-3 text-[10px]">
                  {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name || candidate.id}</option>)}
                </select>
                <label className="mt-4 block text-[9px] font-semibold text-[#6C6258]">Phone number</label>
                <select value={selectedPhoneId} onChange={(event) => setSelectedPhoneId(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-black/[0.08] bg-white px-3 text-[10px]">
                  {selectablePhones.map((candidatePhone) => <option key={candidatePhone.id} value={candidatePhone.id}>{candidatePhone.verifiedName || "WhatsApp Business"}{candidatePhone.displayPhoneNumber ? ` — ${candidatePhone.displayPhoneNumber}` : ""}</option>)}
                </select>
                <button type="button" onClick={confirmSelection} disabled={working || !selectedWabaId || !selectedPhoneId} className="mt-4 h-10 rounded-xl bg-[#25231F] px-4 text-[10px] font-semibold text-[#191919] disabled:opacity-40">{working ? "Connecting…" : "Confirm and connect"}</button>
              </div>
            ) : connected ? (
              <div className={`mt-5 rounded-2xl border p-5 ${operational ? "border-emerald-700/15 bg-emerald-50" : "border-amber-700/15 bg-amber-50"}`}>
                <div className={`flex items-center gap-2 text-[10px] font-semibold ${operational ? "text-emerald-800" : "text-amber-800"}`}>{operational ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}{operational ? "WhatsApp messaging is operational" : "Connection needs review"}</div>
                <div className="mt-2 text-[10px] text-[#5F5850]">{phone?.name || snapshot?.connection?.accountLabel || "Connected WhatsApp Business account"}</div>
                {phone?.displayPhoneNumber ? <div className="mt-1 text-[9px] text-[#8B837A]">{phone.displayPhoneNumber}</div> : null}
                <button type="button" onClick={validateConnection} disabled={working} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-3 text-[9px] font-semibold text-[#655D54] disabled:opacity-40"><RefreshCw size={10} className={working ? "animate-spin" : ""} />{working ? "Checking…" : "Refresh connection"}</button>
              </div>
            ) : snapshot?.publicConfig?.ready ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-[#C9AD89]/20 bg-[#FBF6EF] p-5">
                  <div className="text-[11px] font-semibold">Keep existing WhatsApp Business app number</div>
                  <p className="mt-2 text-[9px] leading-5 text-[#7E7468]">Use coexistence so the existing app and phone number stay active while Avantiqo gains Cloud API access.</p>
                  <button type="button" onClick={() => startEmbeddedSignup("coexistence")} disabled={working} className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#D6A66A] px-4 text-[10px] font-semibold text-[#3F2E1C] disabled:opacity-40">{working ? "Connecting…" : "Use existing app number"}<ExternalLink size={10} /></button>
                </div>
                <div className="rounded-2xl border border-black/[0.07] bg-[#FCFBF8] p-5">
                  <div className="text-[11px] font-semibold">Create/use a Cloud API setup</div>
                  <p className="mt-2 text-[9px] leading-5 text-[#7E7468]">Use standard Meta Embedded Signup for a dedicated Cloud API number or WABA.</p>
                  <button type="button" onClick={() => startEmbeddedSignup("cloud")} disabled={working} className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-4 text-[10px] font-semibold text-[#4A433B] disabled:opacity-40">{working ? "Connecting…" : "Set up Cloud API"}<ExternalLink size={10} /></button>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-amber-700/15 bg-amber-50 p-4 text-[10px] leading-5 text-amber-900">Avantiqo is completing the platform-side WhatsApp setup. No customer technical configuration is required yet.</div>
            )}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-6 text-[#191919] lg:p-10">
      <div className="mx-auto max-w-4xl">
        <a
          href={`/workspace/${encodeURIComponent(organizationId)}/administration/integrations`}
          className="text-sm text-[#D6A66A]"
        >
          ← Integrations
        </a>

        <div className="mt-8 rounded-[30px] border border-black/[0.08] bg-[#FBF8F3] p-6 lg:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-[#A19A92]">
                Messaging
              </div>
              <h1 className="mt-2 text-4xl font-light">WhatsApp Business</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#746E66]">
                Connect the WhatsApp setup this organization actually uses. Keep an existing WhatsApp Business app number through coexistence, or use the standard Cloud API onboarding flow for a new or dedicated setup.
              </p>
            </div>
            <div
              className={`rounded-full border px-3 py-1 text-xs ${
                operational
                  ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                  : connected
                    ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
                    : "border-black/[0.08] bg-[#FBF8F3] text-[#746E66]"
              }`}
            >
              {operational
                ? "Operational"
                : connected
                  ? "Reconnect required"
                  : "Not connected"}
            </div>
          </div>

          {(error || notice) && (
            <div
              className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
                error
                  ? "border-red-400/20 bg-red-400/10 text-red-100"
                  : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
              }`}
            >
              {error || notice}
            </div>
          )}

          {pendingCredentialId && candidates.length ? (
            <div className="mt-6 rounded-2xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] p-5">
              <div className="text-sm font-medium text-[#E5C18D]">
                Confirm WhatsApp assets for this organization
              </div>
              <div className="mt-2 text-xs leading-5 text-[#746E66]">
                Nothing is attached until you confirm. Check both the WhatsApp Business Account and the phone number.
              </div>

              <label className="mt-5 block text-xs text-[#746E66]">
                WhatsApp Business Account
              </label>
              <select
                value={selectedWabaId}
                onChange={(event) => {
                  const nextWabaId = event.target.value;
                  const nextWaba = candidates.find((row) => row.id === nextWabaId);
                  setSelectedWabaId(nextWabaId);
                  setSelectedPhoneId(nextWaba?.phones?.[0]?.id || "");
                }}
                className="mt-2 w-full rounded-xl border border-black/[0.08] bg-[#F7F6F3] px-4 py-3 text-sm text-[#191919]"
              >
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name || candidate.id}
                  </option>
                ))}
              </select>

              <label className="mt-4 block text-xs text-[#746E66]">
                Phone number
              </label>
              <select
                value={selectedPhoneId}
                onChange={(event) => setSelectedPhoneId(event.target.value)}
                className="mt-2 w-full rounded-xl border border-black/[0.08] bg-[#F7F6F3] px-4 py-3 text-sm text-[#191919]"
              >
                {selectablePhones.map((candidatePhone) => (
                  <option key={candidatePhone.id} value={candidatePhone.id}>
                    {candidatePhone.verifiedName || "WhatsApp Business"}
                    {candidatePhone.displayPhoneNumber
                      ? ` — ${candidatePhone.displayPhoneNumber}`
                      : ""}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={confirmSelection}
                disabled={working || !selectedWabaId || !selectedPhoneId}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black disabled:opacity-50"
              >
                {working ? "Connecting…" : "Confirm and connect this number"}
              </button>
            </div>
          ) : connected ? (
            <div
              className={`mt-6 rounded-2xl border p-5 ${
                operational
                  ? "border-emerald-400/15 bg-emerald-400/[0.06]"
                  : "border-amber-400/20 bg-amber-400/[0.06]"
              }`}
            >
              <div
                className={`flex items-center gap-2 ${
                  operational ? "text-emerald-200" : "text-amber-100"
                }`}
              >
                {operational ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                <span className="font-medium">
                  {operational
                    ? "WhatsApp messaging is operational"
                    : "This connection does not have the Communications webhook subscription"}
                </span>
              </div>
              <div className="mt-3 text-sm text-[#5F5A54]">
                {phone?.name ||
                  snapshot?.connection?.accountLabel ||
                  "Connected WhatsApp Business account"}
              </div>
              {phone?.displayPhoneNumber ? (
                <div className="mt-1 text-xs text-[#918B83]">
                  {phone.displayPhoneNumber}
                </div>
              ) : null}
              <button
                type="button"
                onClick={validateConnection}
                disabled={working}
                className="mt-5 inline-flex items-center gap-2 rounded-xl border border-black/[0.08] bg-[#FBF8F3] px-4 py-2.5 text-xs font-medium text-[#5F5A54] disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${working ? "animate-spin" : ""}`} />
                {working ? "Validating…" : "Refresh connection"}
              </button>
            </div>
          ) : snapshot?.publicConfig?.ready ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.04] p-5">
                <div className="text-sm font-semibold text-[#E5C18D]">
                  I already use the WhatsApp Business app
                </div>
                <p className="mt-2 text-xs leading-5 text-[#746E66]">
                  Keep the existing WhatsApp Business app and its current phone number active while adding Avantiqo Cloud API access through coexistence.
                </p>
                <button
                  type="button"
                  onClick={() => startEmbeddedSignup("coexistence")}
                  disabled={working}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#D6A66A] px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
                >
                  {working ? "Connecting…" : "Use existing app number"}
                  <ExternalLink className="h-4 w-4" />
                </button>
                <p className="mt-3 text-[11px] leading-5 text-[#A19A92]">
                  Do not migrate or disconnect the current number.
                </p>
              </div>

              <div className="rounded-2xl border border-black/[0.08] bg-[#FBF8F3] p-5">
                <div className="text-sm font-semibold text-[#2F2C28]">
                  I want a Cloud API setup
                </div>
                <p className="mt-2 text-xs leading-5 text-[#746E66]">
                  Use standard Meta Embedded Signup for an existing Cloud API WABA/number or to create and register a new dedicated WhatsApp Business setup.
                </p>
                <button
                  type="button"
                  onClick={() => startEmbeddedSignup("cloud")}
                  disabled={working}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl border border-black/[0.10] bg-[#FBF8F3] px-4 py-3 text-sm font-semibold text-[#191919] disabled:opacity-50"
                >
                  {working ? "Connecting…" : "Set up Cloud API"}
                  <ExternalLink className="h-4 w-4" />
                </button>
                <p className="mt-3 text-[11px] leading-5 text-[#A19A92]">
                  Choose this when the business does not need to keep the same number active in the WhatsApp Business app.
                </p>
              </div>
            </div>
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
