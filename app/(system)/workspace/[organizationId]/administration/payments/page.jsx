"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CreditCard, Landmark, LoaderCircle, QrCode, ShieldCheck } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const fieldClass = "h-10 w-full rounded-xl border border-black/[0.09] bg-white px-3 text-[11px] text-[#3F3932] outline-none focus:border-[#D6A66A]/70 focus:ring-2 focus:ring-[#D6A66A]/10";

function Row({ icon, title, detail, configured, children }) {
  return (
    <section className="rounded-[20px] border border-black/[0.07] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#D8C5AC] bg-[#FBF5EC] text-[#956B3C]">{icon}</span>
          <div>
            <div className="text-[12px] font-semibold text-[#3A332B]">{title}</div>
            <div className="mt-1 text-[9px] leading-4 text-[#847C72]">{detail}</div>
          </div>
        </div>
        <span className={`rounded-full px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.08em] ${configured ? "bg-emerald-50 text-emerald-700" : "bg-[#F0E7DA] text-[#8A633C]"}`}>{configured ? "Configured" : "Optional"}</span>
      </div>
      {children}
    </section>
  );
}

export default function PaymentSetupPage() {
  const business = useBusinessContext();
  const organizationId = business?.organization_id || business?.organization?.id || null;
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    enableBankTransfer:false,
    enablePromptPay:false,
    enableCards:false,
    bankName:"",
    bankAccountName:"",
    bankAccountNumber:"",
    promptPayId:"",
  });

  const load = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`/api/onboarding/payments?organizationId=${encodeURIComponent(organizationId)}`, { cache:"no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load payment setup");
      setSnapshot(body);
      const configs = body.paymentConfigs || [];
      setForm((current) => ({
        ...current,
        enableBankTransfer: configs.some((row) => row.payment_method === "bank_transfer" && row.enabled),
        enablePromptPay: configs.some((row) => row.payment_method === "qr_payment" && row.enabled),
        enableCards: configs.some((row) => row.payment_method === "credit_card" && row.enabled),
      }));
    } catch (loadError) {
      setError(loadError?.message || "Unable to load payment setup");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { if (business?.ready) load(); }, [business?.ready, load]);

  const country = String(snapshot?.entity?.country || "").toUpperCase();
  const thailand = country === "TH";
  const configs = snapshot?.paymentConfigs || [];
  const providerAccounts = snapshot?.providerAccounts || [];
  const bankReady = configs.some((row) => row.payment_method === "bank_transfer" && row.enabled);
  const promptReady = configs.some((row) => row.payment_method === "qr_payment" && row.enabled);
  const stripeAccount = providerAccounts.find((row) => row.provider === "stripe" && row.purpose === "merchant_payments") || null;
  const cardReady = Boolean(stripeAccount?.charges_enabled && stripeAccount?.payouts_enabled);
  const needsBank = form.enableBankTransfer || form.enablePromptPay;
  const bankComplete = !needsBank || (form.bankName.trim() && form.bankAccountName.trim() && form.bankAccountNumber.trim());
  const canSave = Boolean(bankComplete && (!form.enablePromptPay || form.promptPayId.trim()) && (form.enableBankTransfer || form.enablePromptPay || form.enableCards));

  async function save() {
    if (!organizationId || !canSave || saving) return;
    try {
      setSaving(true);
      setError("");
      setNotice("");
      const response = await fetch("/api/onboarding/payments", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ organizationId, ...form }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to configure payments");
      const onboardingUrl = body?.result?.cardPayments?.onboardingUrl || null;
      setNotice(onboardingUrl ? "Payment configuration saved. Continue in Stripe to finish merchant verification." : "Payment configuration saved.");
      await load();
      if (onboardingUrl) window.location.href = onboardingUrl;
    } catch (saveError) {
      setError(saveError?.message || "Unable to configure payments");
    } finally {
      setSaving(false);
    }
  }

  const configuredCount = useMemo(() => [bankReady, promptReady, cardReady].filter(Boolean).length, [bankReady, promptReady, cardReady]);

  if (loading || !business?.ready) {
    return <div className="flex min-h-[460px] items-center justify-center bg-[#F7F6F3] text-[10px] text-[#817B73]"><LoaderCircle size={14} className="mr-2 animate-spin" />Loading payment setup…</div>;
  }

  return (
    <div className="min-h-[calc(100vh-90px)] bg-[#F7F6F3] px-4 py-5 text-[#28231E] md:px-6">
      <div className="mx-auto max-w-[1100px]">
        <header className="flex flex-col gap-4 border-b border-black/[0.07] pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.17em] text-[#A37849]">Administration · Payments</div>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em]">Customer payment setup</h1>
            <p className="mt-2 max-w-3xl text-[11px] leading-5 text-[#777169]">Connect this organization’s own settlement methods. Customer money goes directly to the organization’s configured bank or merchant account; Avantiqo does not become the merchant for the organization’s sales.</p>
          </div>
          <div className="rounded-2xl border border-black/[0.07] bg-white px-4 py-3 text-right"><div className="text-[20px] font-semibold">{configuredCount}/3</div><div className="mt-1 text-[8px] uppercase tracking-[0.11em] text-[#938B82]">Payment rails ready</div></div>
        </header>

        {error ? <div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{error}</div> : null}
        {notice ? <div className="mt-4 rounded-xl border border-emerald-700/15 bg-emerald-50 px-4 py-3 text-[10px] text-emerald-800">{notice}</div> : null}

        <div className="mt-5 grid gap-4">
          <Row icon={<Landmark size={15} />} title="Bank transfer" detail="Receive direct bank transfers into the organization’s settlement account." configured={bankReady}>
            <label className="mt-4 flex items-center gap-2 text-[10px] font-medium text-[#5C544B]"><input type="checkbox" checked={form.enableBankTransfer} disabled={bankReady} onChange={(event)=>setForm((current)=>({...current,enableBankTransfer:event.target.checked}))} />{bankReady ? "Bank transfer already configured" : "Enable bank transfer"}</label>
          </Row>

          {thailand ? <Row icon={<QrCode size={15} />} title="PromptPay / QR" detail="Use the organization’s registered PromptPay identifier with its settlement bank account." configured={promptReady}>
            <label className="mt-4 flex items-center gap-2 text-[10px] font-medium text-[#5C544B]"><input type="checkbox" checked={form.enablePromptPay} disabled={promptReady} onChange={(event)=>setForm((current)=>({...current,enablePromptPay:event.target.checked}))} />{promptReady ? "PromptPay already configured" : "Enable PromptPay / QR"}</label>
            {form.enablePromptPay ? <input value={form.promptPayId} onChange={(event)=>setForm((current)=>({...current,promptPayId:event.target.value}))} placeholder="PromptPay identifier" className={`${fieldClass} mt-3`} /> : null}
          </Row> : null}

          <Row icon={<CreditCard size={15} />} title="Card payments" detail="Connect the organization’s own Stripe merchant account. Merchant verification stays with Stripe." configured={cardReady}>
            <label className="mt-4 flex items-center gap-2 text-[10px] font-medium text-[#5C544B]"><input type="checkbox" checked={form.enableCards} disabled={cardReady} onChange={(event)=>setForm((current)=>({...current,enableCards:event.target.checked}))} />{cardReady ? "Stripe card payments already configured" : "Connect Stripe card payments"}</label>
            {stripeAccount && !cardReady ? <div className="mt-3 rounded-xl border border-amber-700/15 bg-amber-50 px-3 py-2 text-[9px] text-amber-800">Stripe connection exists but merchant verification is not complete yet.</div> : null}
          </Row>

          {needsBank ? <section className="rounded-[20px] border border-[#C9AD89]/20 bg-[#FBF6EF] p-5">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-[#5C4731]"><ShieldCheck size={13} />Settlement bank account</div>
            <div className="mt-1 text-[9px] leading-4 text-[#847562]">Required for bank transfer or PromptPay. Enter the organization’s own account details.</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input value={form.bankName} onChange={(event)=>setForm((current)=>({...current,bankName:event.target.value}))} placeholder="Bank name" className={fieldClass} />
              <input value={form.bankAccountName} onChange={(event)=>setForm((current)=>({...current,bankAccountName:event.target.value}))} placeholder="Account name" className={fieldClass} />
              <input value={form.bankAccountNumber} onChange={(event)=>setForm((current)=>({...current,bankAccountNumber:event.target.value}))} placeholder="Account number" className={`${fieldClass} md:col-span-2`} autoComplete="off" inputMode="numeric" />
            </div>
          </section> : null}
        </div>

        <button type="button" onClick={save} disabled={!canSave || saving} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-[#B98A52]/25 bg-[#D6A66A] px-4 text-[10px] font-semibold text-[#2C2117] hover:bg-[#C99A5E] disabled:opacity-35">{saving ? <><LoaderCircle size={12} className="animate-spin" />Saving</> : <><Check size={12} />Save payment setup</>}</button>
      </div>
    </div>
  );
}
