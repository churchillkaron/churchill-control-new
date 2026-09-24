"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Globe2, LoaderCircle, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useParams } from "next/navigation";

function statusTone(status) {
  if (["ACTIVE", "READY", "VERIFIED", "LIVE"].includes(status)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (status === "REVOKED") return "border-black/[0.08] bg-[#F2F0ED] text-[#746E67]";
  return "border-amber-700/15 bg-amber-50 text-amber-800";
}

export default function AdministrationDomainsPage() {
  const params = useParams();
  const organizationId = params?.organizationId;
  const [snapshot, setSnapshot] = useState({ hostnames:[] });
  const [hostname, setHostname] = useState("");
  const [staffPortal, setStaffPortal] = useState(true);
  const [verification, setVerification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`/api/administration/domains?organizationId=${encodeURIComponent(organizationId)}`, { cache:"no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load organization hostnames");
      setSnapshot(body);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load organization hostnames");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  async function act(action, targetHostname = hostname) {
    if (!organizationId || !String(targetHostname || "").trim()) return;
    try {
      setSaving(`${action}:${targetHostname}`);
      setError("");
      setNotice("");
      const response = await fetch("/api/administration/domains", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ organizationId, action, hostname:targetHostname, staffPortal }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to update hostname");
      setSnapshot(body);
      if (body.verification) {
        setVerification(body.verification);
        setHostname(body.verification.hostname || "");
        setNotice("DNS ownership challenge created. Add the TXT record, then verify it here.");
      } else if (action === "verify") {
        setVerification(null);
        setNotice("Hostname ownership verified. Avantiqo can now trust this hostname for branded access.");
      } else if (action === "revoke") {
        setVerification(null);
        setNotice("Hostname trust revoked.");
      }
    } catch (actionError) {
      setError(actionError?.message || "Unable to update hostname");
    } finally {
      setSaving("");
    }
  }

  async function copy(value) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied to clipboard.");
    } catch {
      setNotice("Copy is unavailable in this browser. Select the value manually.");
    }
  }

  return (
    <main className="min-h-[calc(100vh-92px)] bg-[#F7F6F3] px-4 py-6 text-[#24201B] md:px-6">
      <div className="mx-auto max-w-[1180px]">
        <header className="border-b border-black/[0.07] pb-5">
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.17em] text-[#A37849]"><Globe2 size={12} /> Administration · External access</div>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em]">Domains & external access</h1>
          <p className="mt-2 max-w-3xl text-[10px] leading-5 text-[#777169]">Register customer-owned hostnames for branded Avantiqo access and Staff Portal. Avantiqo trusts a hostname only after DNS TXT ownership proof succeeds.</p>
        </header>

        {error ? <div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{error}</div> : null}
        {notice ? <div className="mt-4 rounded-xl border border-[#B98A52]/20 bg-[#FBF6EF] px-4 py-3 text-[10px] text-[#765A3E]">{notice}</div> : null}

        <section className="mt-5 grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
          <div className="rounded-[20px] border border-black/[0.07] bg-white p-5">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9A744B]">Register hostname</div>
            <h2 className="mt-2 text-[17px] font-semibold">Prove domain ownership</h2>
            <p className="mt-2 text-[9px] leading-5 text-[#817B73]">Use a hostname you control, such as <strong>staff.example.com</strong>. Platform-owned Avantiqo/Vercel hosts cannot be claimed by customers.</p>
            <label className="mt-5 block text-[9px] font-semibold text-[#5D554D]">Hostname</label>
            <input value={hostname} onChange={(event) => setHostname(event.target.value)} placeholder="staff.example.com" className="mt-2 h-11 w-full rounded-xl border border-black/[0.09] bg-[#FFFDF9] px-3 text-[11px] outline-none focus:border-[#D6A66A]" />
            <label className="mt-4 flex items-center gap-2 text-[9px] text-[#6F675E]">
              <input type="checkbox" checked={staffPortal} onChange={(event) => setStaffPortal(event.target.checked)} className="h-4 w-4 accent-[#B7854E]" />
              Use this hostname for Staff Portal access
            </label>
            <button type="button" onClick={() => act("register")} disabled={!hostname.trim() || Boolean(saving)} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-[#D6A66A] px-4 text-[9px] font-semibold text-[#2C2117] disabled:opacity-35">
              {saving.startsWith("register:") ? <LoaderCircle size={11} className="animate-spin" /> : <ShieldCheck size={11} />}
              Create ownership challenge
            </button>

            <div className="mt-5 rounded-xl border border-[#C7B08D]/20 bg-[#FBF6EF] p-4 text-[8px] leading-5 text-[#776958]">
              DNS ownership verification registers trust inside Avantiqo. Your DNS/hosting must also route the hostname to the Avantiqo deployment for people to open it publicly.
            </div>
          </div>

          <div className="rounded-[20px] border border-black/[0.07] bg-white p-5">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9A744B]">DNS verification</div>
            {verification ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-[#C7B08D]/20 bg-[#FBF6EF] p-4">
                  <div className="text-[8px] uppercase tracking-[0.12em] text-[#9A8C7C]">TXT record name</div>
                  <div className="mt-1 flex items-center justify-between gap-3"><code className="break-all text-[10px] text-[#443B32]">{verification.recordName}</code><button type="button" onClick={() => copy(verification.recordName)} className="rounded-lg border border-black/[0.07] bg-white p-2"><Copy size={10} /></button></div>
                </div>
                <div className="rounded-xl border border-[#C7B08D]/20 bg-[#FBF6EF] p-4">
                  <div className="text-[8px] uppercase tracking-[0.12em] text-[#9A8C7C]">TXT record value</div>
                  <div className="mt-1 flex items-center justify-between gap-3"><code className="break-all text-[10px] text-[#443B32]">{verification.recordValue}</code><button type="button" onClick={() => copy(verification.recordValue)} className="rounded-lg border border-black/[0.07] bg-white p-2"><Copy size={10} /></button></div>
                </div>
                <button type="button" onClick={() => act("verify", verification.hostname)} disabled={Boolean(saving)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#B98A52]/30 bg-[#FFF9F0] px-4 text-[9px] font-semibold text-[#76583A] disabled:opacity-35">
                  {saving.startsWith("verify:") ? <LoaderCircle size={11} className="animate-spin" /> : <Check size={11} />} Verify DNS now
                </button>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-black/[0.09] bg-[#FCFBF8] p-5 text-[9px] leading-5 text-[#817B73]">Create or regenerate an ownership challenge to see the DNS TXT value here. The plaintext verification token is shown only when the challenge is created.</div>
            )}
          </div>
        </section>

        <section className="mt-5 rounded-[20px] border border-black/[0.07] bg-white p-5">
          <div className="flex items-end justify-between gap-3">
            <div><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9A744B]">Registered hostnames</div><div className="mt-1 text-[9px] text-[#817B73]">Verified hostnames can carry organization branding and Staff Portal identity.</div></div>
            <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 text-[8px] font-semibold text-[#765A3E]"><RefreshCw size={9} className={loading ? "animate-spin" : ""} /> Refresh</button>
          </div>
          <div className="mt-4 space-y-2">
            {loading ? <div className="py-8 text-center text-[9px] text-[#918A82]"><LoaderCircle size={12} className="mx-auto mb-2 animate-spin" />Loading hostnames…</div> : null}
            {!loading && !(snapshot.hostnames || []).length ? <div className="rounded-xl border border-dashed border-black/[0.08] bg-[#FCFBF8] p-5 text-[9px] text-[#817B73]">No customer hostname registered yet.</div> : null}
            {(snapshot.hostnames || []).map((item) => (
              <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-black/[0.07] bg-[#FFFDF9] p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="truncate text-[11px] font-semibold">{item.hostname}</span><span className={`rounded-full border px-2 py-1 text-[7px] font-semibold ${statusTone(item.status)}`}>{item.status.replaceAll("_", " ")}</span>{item.staffPortal ? <span className="rounded-full bg-[#F0E7DA] px-2 py-1 text-[7px] font-semibold text-[#806444]">Staff Portal</span> : null}</div>
                  <div className="mt-1 text-[8px] text-[#918A82]">{item.trusted ? "Trusted organization hostname" : item.status === "REVOKED" ? "Trust revoked" : `DNS TXT: ${item.verificationRecordName}`}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!item.trusted && item.status !== "REVOKED" ? <button type="button" onClick={() => act("verify", item.hostname)} disabled={Boolean(saving)} className="rounded-lg border border-[#B98A52]/25 bg-[#FFF9F0] px-3 py-2 text-[8px] font-semibold text-[#76583A]">Verify DNS</button> : null}
                  {!item.trusted ? <button type="button" onClick={() => act("regenerate", item.hostname)} disabled={Boolean(saving)} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[8px] font-semibold text-[#6D665F]">New challenge</button> : null}
                  {item.status !== "REVOKED" ? <button type="button" onClick={() => act("revoke", item.hostname)} disabled={Boolean(saving)} className="inline-flex items-center gap-1 rounded-lg border border-red-700/10 bg-red-50 px-3 py-2 text-[8px] font-semibold text-red-700"><X size={9} /> Revoke</button> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
