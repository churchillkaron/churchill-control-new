"use client";

export default function POSShell({
  tableSelector,
  menu,
  cart,
}) {

  return (

    <div className="h-[calc(100vh-150px)] overflow-y-auto">

      <div className="grid h-full grid-cols-12 gap-5">

        {/* TABLES */}

        <div className="col-span-2 overflow-hidden rounded-[28px] border border-white/10 bg-[#101018] backdrop-blur-xl">

          <div className="flex h-full flex-col">

            <div className="border-b border-white/10 px-5 py-5">

              <div className="text-[11px] tracking-[0.3em] text-violet-400">

                TABLES

              </div>

              <div
                className="mt-2 text-2xl text-white"
                style={{
                  fontWeight: 250,
                  letterSpacing: "-0.05em",
                }}
              >

                Floor

              </div>

            </div>

            <div className="flex-1 overflow-y-auto p-4">

              {tableSelector}

            </div>

          </div>

        </div>

        {/* MENU */}

        <div className="col-span-7 overflow-hidden rounded-[28px] border border-white/10 bg-[#0D0D14] backdrop-blur-xl">

          <div className="flex h-full flex-col">

            <div className="border-b border-white/10 px-6 py-5">

              <div className="flex items-center justify-between">

                <div>

                  <div className="text-[11px] tracking-[0.3em] text-violet-400">

                    MENU

                  </div>

                  <div
                    className="mt-2 text-3xl text-white"
                    style={{
                      fontWeight: 250,
                      letterSpacing: "-0.06em",
                    }}
                  >

                    Operational POS

                  </div>

                </div>

                <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-5 py-2 text-sm text-emerald-300">

                  LIVE SERVICE

                </div>

              </div>

            </div>

            <div className="flex-1 overflow-y-auto p-6">

              {menu}

            </div>

          </div>

        </div>

        {/* CART */}

        <div className="col-span-3 rounded-[28px] border border-white/10 bg-[#12121A] backdrop-blur-xl h-full flex flex-col">

          <div className="flex h-full flex-col">

            <div className="border-b border-white/10 px-5 py-5">

              <div className="text-[11px] tracking-[0.3em] text-violet-400">

                ORDER FLOW

              </div>

              <div
                className="mt-2 text-3xl text-white"
                style={{
                  fontWeight: 250,
                  letterSpacing: "-0.06em",
                }}
              >

                Cart

              </div>

            </div>

            {/* INDEPENDENT SCROLL */}

            <div className="flex-1 overflow-y-auto px-5 py-4">

              {cart}

            </div>

          </div>

        </div>

      </div>

    </div>

  );

}
