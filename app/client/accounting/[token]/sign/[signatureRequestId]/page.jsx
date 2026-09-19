"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, FileSignature, LoaderCircle, ShieldCheck, XCircle } from "lucide-react";

const text = (value) => String(value ?? "").trim();
const label = (value) => text(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const shortDate = (value) => value ? String(value).replace("T", " ").slice(0, 16) : "—";

export default function AccountingClientSignaturePage() {
  const params = useParams();
  const router = useRouter();
  const token = text(params?.token);
  const signatureRequestId = text(params?.signatureRequestId);
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [signerName, setSignerName] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      setState((current) => ({ ...current, loading: true, error: "" }));
      const response = await fetch(`/api/public/finance/client-portal/${encodeURIComponent(token)}/signatures/${encodeURIComponent(signatureRequestId)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load signature request");
      setState({ loading: false, error: "", data: body });
      setSignerName((current) => current || body.signature?.signer_name || "");
    } catch (error) {
      setState({ loading: false, error: error?.message || "Unable to load signature request", data: null });
    }
  }
  useEffect(() => { if (token && signatureRequestId) load(); }, [token, signatureRequestId]);

  async function act(action) {
    try {
      setBusy(action); setNotice("");
      const response = await fetch(`/api/public/finance/client-portal/${encodeURIComponent(token)}/signatures/${encodeURIComponent(signatureRequestId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, signerName, consent }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to complete signature action");
      setNotice(action === "sign" ? "Signature recorded against this exact document version." : "Signature request declined.");
      await load();
    } catch (error) { setNotice(error?.message || "Unable to complete signature action"); }
    finally { setBusy(""); }
  }

  if (state.loading && !state.data) return <main className="min-h-screen bg-[#F4F0E9] px-4 py-16"><div className="mx-auto flex max-w-xl items-center justify-center rounded-3xl border border-black/[0.07] bg-white p-10 text-sm text-[#706A63]"><LoaderCircle className="mr-2 animate-spin" size={16}/>Loading signature request…</div></main>;
  if (state.error && !state.data) return <main className="min-h-screen bg-[#F4F0E9] px-4 py-16"><div className="mx-auto max-w-xl rounded-3xl border border-red-700/15 bg-white p-8 text-center"><ShieldCheck size={24} className="mx-auto text-[#A37849]"/><div className="mt-3 text-base font-semibold">Signature request unavailable</div><div className="mt-2 text-sm text-[#8B8177]">{state.error}</div></div></main>;

  const data = state.data || {};
  const signature = data.signature || {};
  const document = data.document || {};
  const terminal = ["SIGNED","DECLINED","EXPIRED","CANCELLED"].includes(text(signature.status).toUpperCase());
  const openDocument = () => window.open(`/api/public/finance/client-portal/${encodeURIComponent(token)}/${document.open_path}`, "_blank", "noopener,noreferrer");

  return <main className="min-h-screen bg-[#F4F0E9] px-4 py-8 text-[#28241F]">
    <div className="mx-auto max-w-2xl">
      <button type="button" onClick={() => router.push(`/client/accounting/${encodeURIComponent(token)}`)} className="mb-3 text-xs font-semibold text-[#76583A]">← Back to client portal</button>
      <section className="overflow-hidden rounded-3xl border border-black/[0.07] bg-white">
        <div className="border-b border-black/[0.06] bg-[#171512] p-5 text-white"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#D6A66A]"><FileSignature size={14}/>Electronic signature</div><h1 className="mt-2 text-xl font-semibold">{document.name || "Engagement document"}</h1><div className="mt-1 text-xs text-white/55">Version {document.version_number} · checksum {text(document.checksum_sha256).slice(0, 16)}…</div></div>
        <div className="p-5 md:p-6">
          <div className="grid gap-2 sm:grid-cols-2"><div className="rounded-xl bg-[#F8F6F2] p-3 text-xs"><div className="text-[9px] uppercase tracking-[0.1em] text-[#968D83]">Signer</div><div className="mt-1 font-semibold">{signature.signer_name || signature.signer_email || "Signer"}</div></div><div className="rounded-xl bg-[#F8F6F2] p-3 text-xs"><div className="text-[9px] uppercase tracking-[0.1em] text-[#968D83]">Status</div><div className="mt-1 font-semibold">{label(signature.status)}</div></div></div>
          <div className="mt-3 rounded-xl border border-[#A37849]/15 bg-[#FFF9EF] p-3 text-xs leading-5 text-[#76583A]">This is an Avantiqo simple electronic signature bound to this exact controlled-document version and SHA-256 checksum. It is not represented as a qualified or certificate-based digital signature. Legal effect depends on the applicable contract and law.</div>
          <button type="button" onClick={openDocument} className="mt-4 w-full rounded-xl border border-black/[0.08] bg-white px-4 py-3 text-sm font-semibold">Open and review exact document</button>

          {notice ? <div className="mt-3 rounded-xl border border-[#A37849]/15 bg-[#FBF7F1] p-3 text-xs text-[#76583A]">{notice}</div> : null}
          {signature.status === "SIGNED" ? <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-700/15 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 size={18} className="mt-0.5 shrink-0"/><div><b>Signed</b><div className="mt-1 text-xs">Signed by {signature.signed_name || signature.signer_name || "signer"} · {shortDate(signature.signed_at)}</div></div></div> : null}
          {signature.status === "DECLINED" ? <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-700/15 bg-red-50 p-4 text-sm text-red-800"><XCircle size={18} className="mt-0.5 shrink-0"/><div><b>Declined</b><div className="mt-1 text-xs">Declined {shortDate(signature.declined_at)}</div></div></div> : null}

          {!terminal ? <div className="mt-5 space-y-3"><label className="block text-xs font-medium text-[#5E5750]">Type your full name<input value={signerName} onChange={(event) => setSignerName(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-black/[0.09] px-3 text-sm" /></label><label className="flex items-start gap-2 rounded-xl border border-black/[0.07] bg-[#FAF9F7] p-3 text-xs leading-5"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1"/><span>{signature.consent_text || "I have reviewed this exact document and agree to sign it electronically."}</span></label><div className="grid gap-2 sm:grid-cols-2"><button type="button" disabled={Boolean(busy) || !signerName.trim() || !consent} onClick={() => act("sign")} className="h-11 rounded-xl bg-[#76583A] text-sm font-semibold text-white disabled:opacity-35">{busy === "sign" ? "Signing…" : "Sign document"}</button><button type="button" disabled={Boolean(busy)} onClick={() => act("decline")} className="h-11 rounded-xl border border-red-700/15 bg-white text-sm font-semibold text-red-800 disabled:opacity-35">{busy === "decline" ? "Declining…" : "Decline"}</button></div></div> : null}
        </div>
      </section>
    </div>
  </main>;
}
