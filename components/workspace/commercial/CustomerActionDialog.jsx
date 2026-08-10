"use client";

import { useEffect, useMemo, useState } from "react";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonth() {
  const value = new Date();
  value.setDate(1);
  return value.toISOString().slice(0, 10);
}

function idempotencyKey(prefix) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return `${prefix}:${id}`;
}

function Field({ label, children, span = false }) {
  return (
    <label className={`${span ? "md:col-span-2" : ""} text-[11px] text-white/48`}>
      {label}
      {children}
    </label>
  );
}

const control =
  "mt-2 h-11 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 text-[13px] text-white outline-none focus:border-amber-300/30";
const textarea =
  "mt-2 w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-[13px] text-white outline-none focus:border-amber-300/30";

function initialForm(action, detail) {
  const balances = detail?.finance?.balances || [];
  const currency =
    balances[0]?.currency_code || detail?.preferred_currency || detail?.loyalty?.rewards?.[0]?.currency_code || "";
  const openCases = (detail?.finance?.collection_cases || []).filter(
    (row) => !["CLOSED", "RESOLVED"].includes(String(row.status || "").toUpperCase())
  );
  const programs = (detail?.loyalty?.programs || []).filter(
    (row) => String(row.status || "ACTIVE").toUpperCase() === "ACTIVE"
  );
  const rewards = (detail?.loyalty?.rewards || []).filter(
    (row) => String(row.status || "ACTIVE").toUpperCase() === "ACTIVE"
  );

  switch (action) {
    case "statement":
      return {
        statement_date: today(),
        period_start: firstDayOfMonth(),
        period_end: today(),
        currency_code: currency,
      };
    case "collection_case":
      return {
        priority: "NORMAL",
        customer_invoice_id: "",
        next_follow_up_at: "",
        promise_amount: "",
        promise_date: "",
        disputed: false,
        hold_reason: "",
      };
    case "collection_activity":
      return {
        collection_case_id: openCases[0]?.id || "",
        activity_type: "NOTE",
        notes: "",
        outcome: "",
        follow_up_at: "",
        promise_amount: "",
        promise_date: "",
        case_status: "",
      };
    case "loyalty_adjust":
      return {
        points_delta: "",
        reason: "",
      };
    case "loyalty_redeem":
      return {
        reward_id: rewards[0]?.id || "",
      };
    case "loyalty_enroll":
      return {
        program_id: programs[0]?.id || "",
      };
    default:
      return {};
  }
}

function titleFor(action) {
  return {
    statement: "Generate Customer Statement",
    collection_case: "Open Collection Case",
    collection_activity: "Record Collection Activity",
    loyalty_adjust: "Adjust Loyalty Points",
    loyalty_redeem: "Redeem Loyalty Reward",
    loyalty_enroll: "Enroll in Loyalty",
  }[action] || "Customer Action";
}

function descriptionFor(action) {
  return {
    statement: "Finance creates the statement from the authoritative customer account for this legal entity.",
    collection_case: "Finance owns the collections case. This action keeps the same Party identity and entity scope.",
    collection_activity: "Add a controlled activity to an existing Finance collection case.",
    loyalty_adjust: "Commercial Loyalty records an immutable points ledger entry for this Party.",
    loyalty_redeem: "Redeem one of the active rewards configured for the customer loyalty program.",
    loyalty_enroll: "Enroll this Party in an active Commercial loyalty program.",
  }[action] || "Execute a controlled customer action.";
}

async function postJson(endpoint, body) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.success === false) {
    throw new Error(result?.error || `Request failed (${response.status})`);
  }
  return result;
}

export default function CustomerActionDialog({
  action,
  customer,
  detail,
  organizationId,
  entityId,
  onClose,
  onComplete,
}) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!action) return;
    setForm(initialForm(action, detail));
    setError("");
    setSuccess("");
  }, [action, customer?.party_id, detail?.as_of_date]);

  const balances = detail?.finance?.balances || [];
  const invoices = (detail?.finance?.transactions || []).filter(
    (row) => String(row.event_type || "").toUpperCase() === "INVOICE"
  );
  const openCases = (detail?.finance?.collection_cases || []).filter(
    (row) => !["CLOSED", "RESOLVED"].includes(String(row.status || "").toUpperCase())
  );
  const programs = useMemo(() => {
    const rows = detail?.loyalty?.programs || [];
    return rows.filter(
      (row) => String(row.status || "ACTIVE").toUpperCase() === "ACTIVE"
    );
  }, [detail?.loyalty?.programs]);
  const rewards = useMemo(() => {
    const rows = detail?.loyalty?.rewards || [];
    const programId = detail?.loyalty?.account?.program_id || null;
    return rows.filter(
      (row) =>
        String(row.status || "ACTIVE").toUpperCase() === "ACTIVE" &&
        (!programId || row.program_id === programId)
    );
  }, [detail?.loyalty?.rewards, detail?.loyalty?.account?.program_id]);

  if (!action) return null;

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    if (!customer?.party_id || !organizationId) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      let result;

      if (action === "statement") {
        if (!entityId) throw new Error("Select a legal entity before generating a statement");
        if (!form.currency_code) throw new Error("Currency is required");
        result = await postJson("/api/finance/customer-statements/generate", {
          organization_id: organizationId,
          entity_id: entityId,
          party_id: customer.party_id,
          statement_date: form.statement_date,
          period_start: form.period_start,
          period_end: form.period_end,
          currency_code: form.currency_code,
          idempotency_key: idempotencyKey("customer-statement"),
        });
      }

      if (action === "collection_case") {
        if (!entityId) throw new Error("Select a legal entity before opening a collection case");
        result = await postJson("/api/finance/collections/cases", {
          organization_id: organizationId,
          entity_id: entityId,
          party_id: customer.party_id,
          priority: form.priority || "NORMAL",
          customer_invoice_id: form.customer_invoice_id || null,
          next_follow_up_at: form.next_follow_up_at || null,
          promise_amount: form.promise_amount === "" ? null : Number(form.promise_amount),
          promise_date: form.promise_date || null,
          disputed: Boolean(form.disputed),
          hold_reason: form.hold_reason || null,
          idempotency_key: idempotencyKey("collection-case"),
        });
      }

      if (action === "collection_activity") {
        if (!entityId) throw new Error("Select a legal entity before recording collection activity");
        if (!form.collection_case_id) throw new Error("Select a collection case");
        if (!String(form.activity_type || "").trim()) throw new Error("Activity type is required");
        result = await postJson("/api/finance/collections/activities", {
          organization_id: organizationId,
          entity_id: entityId,
          party_id: customer.party_id,
          collection_case_id: form.collection_case_id,
          activity_type: form.activity_type,
          notes: form.notes || null,
          outcome: form.outcome || null,
          follow_up_at: form.follow_up_at || null,
          promise_amount: form.promise_amount === "" ? null : Number(form.promise_amount),
          promise_date: form.promise_date || null,
          case_status: form.case_status || null,
          idempotency_key: idempotencyKey("collection-activity"),
        });
      }

      if (action === "loyalty_adjust") {
        const points = Number(form.points_delta);
        if (!Number.isFinite(points) || points === 0) {
          throw new Error("Enter a non-zero points adjustment");
        }
        result = await postJson("/api/commercial/customers/loyalty", {
          action: "adjust",
          organization_id: organizationId,
          entity_id: entityId || null,
          party_id: customer.party_id,
          points_delta: points,
          source_domain: "COMMERCIAL",
          source_document_type: "CUSTOMER_ACCOUNT",
          metadata: {
            reason: form.reason || null,
            source: "customer_account",
          },
          idempotency_key: idempotencyKey("loyalty-adjust"),
        });
      }

      if (action === "loyalty_redeem") {
        if (!form.reward_id) throw new Error("Select a reward");
        result = await postJson("/api/commercial/customers/loyalty", {
          action: "redeem_reward",
          organization_id: organizationId,
          entity_id: entityId || null,
          party_id: customer.party_id,
          reward_id: form.reward_id,
          source_document_type: "CUSTOMER_ACCOUNT",
          metadata: { source: "customer_account" },
          idempotency_key: idempotencyKey("loyalty-reward"),
        });
      }

      if (action === "loyalty_enroll") {
        if (!form.program_id) throw new Error("Select a loyalty program");
        result = await postJson("/api/commercial/customers/loyalty", {
          action: "enroll",
          organization_id: organizationId,
          entity_id: entityId || null,
          party_id: customer.party_id,
          program_id: form.program_id,
          idempotency_key: idempotencyKey("loyalty-enroll"),
        });
      }

      setSuccess("Action completed successfully.");
      await onComplete?.(result);
    } catch (submitError) {
      setError(submitError?.message || "Action failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xl">
      <div className="w-full max-w-2xl rounded-[30px] border border-white/[0.1] bg-[#0b0b0b] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-amber-300/60">
              {action.startsWith("loyalty") ? "Commercial · Loyalty" : "Finance · Customer Account"}
            </div>
            <h2 className="mt-3 text-[28px] font-light tracking-[-0.05em]">
              {titleFor(action)}
            </h2>
            <p className="mt-2 max-w-xl text-[12px] leading-5 text-white/38">
              {descriptionFor(action)}
            </p>
            <div className="mt-2 text-[11px] text-white/28">
              {customer?.customer_name || customer?.display_name} · Party {customer?.party_id}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-white/[0.08] px-3 py-2 text-[12px] text-white/50"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {action === "statement" ? (
            <>
              <Field label="Statement date">
                <input type="date" value={form.statement_date || ""} onChange={(event) => update("statement_date", event.target.value)} className={control} />
              </Field>
              <Field label="Currency">
                <select value={form.currency_code || ""} onChange={(event) => update("currency_code", event.target.value)} className={control}>
                  <option value="">Select currency</option>
                  {[...new Set(balances.map((row) => row.currency_code).filter(Boolean))].map((currency) => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                  {detail?.preferred_currency && !balances.some((row) => row.currency_code === detail.preferred_currency) ? (
                    <option value={detail.preferred_currency}>{detail.preferred_currency}</option>
                  ) : null}
                </select>
              </Field>
              <Field label="Period start">
                <input type="date" value={form.period_start || ""} onChange={(event) => update("period_start", event.target.value)} className={control} />
              </Field>
              <Field label="Period end">
                <input type="date" value={form.period_end || ""} onChange={(event) => update("period_end", event.target.value)} className={control} />
              </Field>
            </>
          ) : null}

          {action === "collection_case" ? (
            <>
              <Field label="Priority">
                <select value={form.priority || "NORMAL"} onChange={(event) => update("priority", event.target.value)} className={control}>
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </Field>
              <Field label="Invoice (optional)">
                <select value={form.customer_invoice_id || ""} onChange={(event) => update("customer_invoice_id", event.target.value)} className={control}>
                  <option value="">Customer-wide case</option>
                  {invoices.map((invoice) => (
                    <option key={invoice.document_id} value={invoice.document_id}>
                      {invoice.reference || invoice.document_id} · {invoice.outstanding_amount || 0} {invoice.currency_code || ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Next follow-up">
                <input type="datetime-local" value={form.next_follow_up_at || ""} onChange={(event) => update("next_follow_up_at", event.target.value)} className={control} />
              </Field>
              <Field label="Promise amount">
                <input type="number" step="0.01" value={form.promise_amount || ""} onChange={(event) => update("promise_amount", event.target.value)} className={control} />
              </Field>
              <Field label="Promise date">
                <input type="date" value={form.promise_date || ""} onChange={(event) => update("promise_date", event.target.value)} className={control} />
              </Field>
              <Field label="Hold reason">
                <input value={form.hold_reason || ""} onChange={(event) => update("hold_reason", event.target.value)} className={control} />
              </Field>
              <Field label="Disputed" span>
                <div className="mt-3 flex items-center gap-3 text-[12px] text-white/65">
                  <input type="checkbox" checked={Boolean(form.disputed)} onChange={(event) => update("disputed", event.target.checked)} />
                  Mark this customer balance as disputed for collections workflow
                </div>
              </Field>
            </>
          ) : null}

          {action === "collection_activity" ? (
            <>
              <Field label="Collection case" span>
                <select value={form.collection_case_id || ""} onChange={(event) => update("collection_case_id", event.target.value)} className={control}>
                  <option value="">Select case</option>
                  {openCases.map((row) => (
                    <option key={row.id} value={row.id}>{row.case_number || row.id} · {row.status || "OPEN"}</option>
                  ))}
                </select>
              </Field>
              <Field label="Activity type">
                <select value={form.activity_type || "NOTE"} onChange={(event) => update("activity_type", event.target.value)} className={control}>
                  <option value="NOTE">Note</option>
                  <option value="CALL">Call</option>
                  <option value="EMAIL">Email</option>
                  <option value="SMS">SMS</option>
                  <option value="MEETING">Meeting</option>
                  <option value="PROMISE_TO_PAY">Promise to pay</option>
                  <option value="DISPUTE">Dispute</option>
                </select>
              </Field>
              <Field label="Outcome">
                <input value={form.outcome || ""} onChange={(event) => update("outcome", event.target.value)} className={control} />
              </Field>
              <Field label="Follow-up">
                <input type="datetime-local" value={form.follow_up_at || ""} onChange={(event) => update("follow_up_at", event.target.value)} className={control} />
              </Field>
              <Field label="Case status">
                <select value={form.case_status || ""} onChange={(event) => update("case_status", event.target.value)} className={control}>
                  <option value="">Keep current</option>
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="ON_HOLD">On hold</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </Field>
              <Field label="Promise amount">
                <input type="number" step="0.01" value={form.promise_amount || ""} onChange={(event) => update("promise_amount", event.target.value)} className={control} />
              </Field>
              <Field label="Promise date">
                <input type="date" value={form.promise_date || ""} onChange={(event) => update("promise_date", event.target.value)} className={control} />
              </Field>
              <Field label="Notes" span>
                <textarea rows={4} value={form.notes || ""} onChange={(event) => update("notes", event.target.value)} className={textarea} />
              </Field>
            </>
          ) : null}

          {action === "loyalty_adjust" ? (
            <>
              <Field label="Points adjustment">
                <input type="number" step="1" value={form.points_delta || ""} onChange={(event) => update("points_delta", event.target.value)} placeholder="Use negative number to deduct" className={control} />
              </Field>
              <Field label="Current points">
                <div className="mt-2 flex h-11 items-center rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 text-[13px] text-white/70">
                  {detail?.loyalty?.account?.loyalty_points || 0}
                </div>
              </Field>
              <Field label="Reason" span>
                <textarea rows={4} value={form.reason || ""} onChange={(event) => update("reason", event.target.value)} className={textarea} />
              </Field>
            </>
          ) : null}

          {action === "loyalty_redeem" ? (
            <Field label="Reward" span>
              <select value={form.reward_id || ""} onChange={(event) => update("reward_id", event.target.value)} className={control}>
                <option value="">Select reward</option>
                {rewards.map((reward) => (
                  <option key={reward.id} value={reward.id}>
                    {reward.name || reward.code} · {reward.points_cost} pts
                    {reward.monetary_value ? ` · ${reward.monetary_value} ${reward.currency_code || ""}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {action === "loyalty_enroll" ? (
            <Field label="Loyalty program" span>
              <select value={form.program_id || ""} onChange={(event) => update("program_id", event.target.value)} className={control}>
                <option value="">Select program</option>
                {programs.map((program) => (
                  <option key={program.id} value={program.id}>{program.name || program.code}</option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>

        {action === "collection_activity" && openCases.length === 0 ? (
          <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-3 text-[12px] text-amber-100">
            This customer has no open collection case. Open a case first.
          </div>
        ) : null}

        {action === "loyalty_redeem" && rewards.length === 0 ? (
          <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-3 text-[12px] text-amber-100">
            No active rewards are configured for this customer program.
          </div>
        ) : null}

        {action === "loyalty_enroll" && programs.length === 0 ? (
          <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-3 text-[12px] text-amber-100">
            No active loyalty programs are available for this organization.
          </div>
        ) : null}

        {error ? <div className="mt-4 text-[12px] text-red-300">{error}</div> : null}
        {success ? <div className="mt-4 text-[12px] text-emerald-300">{success}</div> : null}

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="h-10 rounded-xl border border-white/[0.08] px-4 text-[12px] text-white/55">
            Cancel
          </button>
          <button
            disabled={saving || (action === "collection_activity" && openCases.length === 0) || (action === "loyalty_redeem" && rewards.length === 0) || (action === "loyalty_enroll" && programs.length === 0)}
            onClick={submit}
            className="h-10 rounded-xl border border-amber-300/35 bg-gradient-to-b from-amber-200 to-amber-500 px-5 text-[12px] font-semibold text-black disabled:opacity-40"
          >
            {saving ? "Working..." : "Confirm Action"}
          </button>
        </div>
      </div>
    </div>
  );
}
