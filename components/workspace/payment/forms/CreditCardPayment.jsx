"use client";

export default function CreditCardPayment() {
  return (
    <div className="rounded-2xl border border-black/[0.08] bg-[#FCFBF9] p-4">
      <div className="text-[11px] font-medium text-[#3F3A34]">
        Secure card checkout
      </div>
      <div className="mt-1 text-[10px] leading-4 text-[#7C756D]">
        Card number, expiry and CVC are never entered into or stored by Avantiqo.
        Continue to open the connected licensed payment provider&apos;s secure checkout.
      </div>
    </div>
  );
}
