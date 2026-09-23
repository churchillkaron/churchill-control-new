"use client";

export default function BankTransferPayment() {
  return (
    <div className="rounded-2xl border border-black/[0.08] bg-[#FCFBF9] p-4">
      <div className="text-[11px] font-medium text-[#3F3A34]">
        Bank transfer
      </div>
      <div className="mt-1 text-[10px] leading-4 text-[#7C756D]">
        Avantiqo will issue the exact receiving account and payment reference after you continue.
        The payment is not marked settled until bank reconciliation verifies the incoming funds.
      </div>
    </div>
  );
}
