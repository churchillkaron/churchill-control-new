"use client";

export default function AccountingPage() {
  return (
    <div className="space-y-8">

      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-[#d7b66a]">
          Accounting Runtime
        </div>

        <h1 className="mt-3 text-5xl font-extralight tracking-[-0.05em] text-white">
          Enterprise Accounting
        </h1>
      </div>

      <div className="grid gap-6 xl:grid-cols-4">

        {[
          "Journal Entries",
          "General Ledger",
          "Trial Balance",
          "Profit & Loss",
          "Balance Sheet",
          "Accounts Payable",
          "Accounts Receivable",
          "Tax Center",
        ].map((item) => (
          <div
            key={item}
            className="rounded-[28px] border border-white/[0.06] bg-white/[0.03] p-6 backdrop-blur-xl"
          >
            <div className="text-lg font-light text-white">
              {item}
            </div>

            <div className="mt-3 text-sm text-white/50">
              Runtime accounting module connected to journal engine.
            </div>
          </div>
        ))}

      </div>

    </div>
  );
}
