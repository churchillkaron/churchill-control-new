"use client";

export default function POSShell({
tableSelector,
menu,
cart,
}) {
return ( <div className="h-[calc(100vh-140px)] overflow-hidden">

  <div className="grid h-full grid-cols-12 gap-4">

    {/* LEFT SIDEBAR */}
    <div className="col-span-3 xl:col-span-2 overflow-hidden rounded-[28px] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] bg-[#101018] backdrop-blur-xl">

      <div className="flex h-full flex-col p-4">

        <div className="mb-6">

          <div className="text-[11px] tracking-[0.3em] text-[#B58AF8]">
            TABLES
          </div>

        </div>

        <div className="flex-1 overflow-y-auto">
          {tableSelector}
        </div>

      </div>

    </div>

    {/* CENTER */}
    <div className="col-span-6 xl:col-span-7 overflow-hidden rounded-[28px] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] bg-[#0D0D14] backdrop-blur-xl">

      <div className="flex h-full flex-col">

        <div className="border-b border-white/10 px-5 py-4">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-[11px] tracking-[0.3em] text-[#B58AF8]">
                MENU
              </div>

              <div
                className="mt-2 text-2xl"
                style={{
                  fontWeight: 250,
                  letterSpacing: "-0.05em",
                }}
              >
                Operational POS
              </div>

            </div>

            <div className="rounded-full border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] bg-white/[0.03] px-5 py-2 text-sm text-white/50">
              LIVE
            </div>

          </div>

        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {menu}
        </div>

      </div>

    </div>

    {/* RIGHT CART */}
    <div className="col-span-3 overflow-hidden rounded-[28px] border border-white/10 bg-[#12121A] backdrop-blur-xl">

      <div className="flex h-full flex-col">

        <div className="border-b border-white/10 px-5 py-4">

          <div className="text-[11px] tracking-[0.3em] text-[#B58AF8]">
            ORDER
          </div>

          <div
            className="mt-2 text-2xl"
            style={{
              fontWeight: 250,
              letterSpacing: "-0.05em",
            }}
          >
            Cart
          </div>

        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {cart}
        </div>

      </div>

    </div>

  </div>

</div>

);
}
