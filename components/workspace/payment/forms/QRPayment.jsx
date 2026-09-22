"use client";

export default function QRPayment() {
  return (
    <div className="rounded-2xl border border-black/[0.08] bg-[#FCFBF9] p-4">
      <div className="text-[11px] font-medium text-[#3F3A34]">
        QR payment
      </div>
      <div className="mt-1 text-[10px] leading-4 text-[#7C756D]">
        Avantiqo will generate the payment QR from the configured rail after you continue.
        Settlement is only accepted after independent provider or bank verification.
      </div>
    </div>
  );
}
