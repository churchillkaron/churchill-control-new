"use client";

import { useEffect, useState } from "react";

function money(value) {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function accountDetails(line = {}) {
  const account =
    line.account ||
    line.chart_of_accounts ||
    line.chartOfAccounts ||
    null;

  return {
    code:
      account?.account_code ||
      account?.code ||
      line.account_code ||
      null,
    name:
      account?.account_name ||
      account?.name ||
      line.account_name ||
      null,
  };
}

export default function FinanceJournalDetailEngine({
  row,
  organizationId,
  onClose,
}) {
  const [journal, setJournal] = useState(row || null);
  const [lines, setLines] = useState(row?.lines || []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      if (!row?.id || !organizationId) {
        setError("Journal context is incomplete.");
        setLoading(false);
        return;
      }

      try {
        const params = new URLSearchParams({
          organizationId,
          organization_id: organizationId,
        });
        const response = await fetch(
          `/api/finance/journals/${row.id}?${params.toString()}`,
          { cache: "no-store" }
        );
        const json = await response.json().catch(() => ({}));

        if (!response.ok || !json?.success) {
          throw new Error(json?.error || "Journal could not be loaded.");
        }

        if (!active) return;
        setJournal(json.journal || row);
        setLines(Array.isArray(json.lines) ? json.lines : []);
      } catch (loadError) {
        if (active) setError(loadError.message || "Journal could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [row, organizationId]);

  const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-5 text-white backdrop-blur-xl">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-[32px] border border-white/10 bg-[#090909] p-7 shadow-2xl shadow-black/80">
        <div className="flex items-start justify-between gap-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-[#D6A66A]">
              Journal Entry
            </div>
            <h2 className="mt-3 text-[34px] font-light tracking-[-0.05em]">
              {journal?.journal_number || "Journal"}
            </h2>
            <p className="mt-2 text-[13px] text-white/45">
              {journal?.description || journal?.reference || "Accounting journal detail"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-[12px] text-white/60"
          >
            Close
          </button>
        </div>

        {loading ? (
          <div className="mt-8 text-[13px] text-white/45">Loading journal...</div>
        ) : error ? (
          <div className="mt-8 rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-5 text-[13px] text-red-200">
            {error}
          </div>
        ) : (
          <>
            <div className="mt-7 grid gap-3 md:grid-cols-4">
              {[
                ["Posting date", journal?.posting_date || journal?.document_date || "-"],
                ["Status", journal?.status || "-"],
                ["Reference", journal?.reference || "-"],
                ["Currency", journal?.currency_code || journal?.currency || "-"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/30">{label}</div>
                  <div className="mt-2 text-[13px] text-white/75">{value}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 overflow-hidden rounded-[24px] border border-white/10">
              <div className="grid grid-cols-[1fr_180px_180px] border-b border-white/10 bg-white/[0.04] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-white/35">
                <div>Account</div>
                <div className="text-right">Debit</div>
                <div className="text-right">Credit</div>
              </div>
              {lines.length ? lines.map((line, index) => {
                const account = accountDetails(line);
                return (
                  <div key={line.id || index} className="grid grid-cols-[1fr_180px_180px] border-b border-white/[0.06] px-5 py-4 text-[13px] last:border-b-0">
                    <div>
                      <div className="text-white/80">
                        {account.code || "Account"}
                        {account.name ? ` · ${account.name}` : ""}
                      </div>
                      {line.description ? <div className="mt-1 text-[12px] text-white/35">{line.description}</div> : null}
                    </div>
                    <div className="text-right text-white/70">{money(line.debit)}</div>
                    <div className="text-right text-white/70">{money(line.credit)}</div>
                  </div>
                );
              }) : (
                <div className="p-6 text-[13px] text-white/40">No journal lines found.</div>
              )}
              <div className="grid grid-cols-[1fr_180px_180px] border-t border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] px-5 py-4 text-[13px] font-medium">
                <div>Total</div>
                <div className="text-right">{money(totalDebit)}</div>
                <div className="text-right">{money(totalCredit)}</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
