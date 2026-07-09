"use client";

export default function QRPayment(){

  return (

    <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-center">

      <div className="text-white/60">
        QR Payment
      </div>


      <div className="mt-6 flex h-48 items-center justify-center rounded-xl bg-white text-black">

        QR CODE

      </div>


      <div className="mt-4 text-sm text-white/50">
        Waiting for payment confirmation
      </div>

    </div>

  );

}
