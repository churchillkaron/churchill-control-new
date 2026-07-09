"use client";

export default function BankTransferPayment(){

  return (

    <div className="rounded-2xl border border-white/10 bg-black/20 p-6">

      <div className="text-white">
        Bank Transfer
      </div>


      <div className="mt-4 space-y-2 text-sm text-white/60">

        <div>
          Bank: Example Bank
        </div>

        <div>
          Account: XXXX XXXX
        </div>

        <div>
          Reference required
        </div>

      </div>

    </div>

  );

}
