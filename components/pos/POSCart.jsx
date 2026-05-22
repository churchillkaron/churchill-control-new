"use client";

import {
  Minus,
  Plus,
  Send,
} from "lucide-react";

export default function POSCart({
  items = [],
  total = 0,
  onQuantityChange,
  onSendOrder,
}) {

  return (

    <div className="flex h-full flex-col overflow-hidden">

      {/* ITEMS */}

      <div className="flex-1 overflow-y-auto pr-2">

        <div className="space-y-3 pb-6">

          {items.length === 0 && (

            <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-white/40">

              Cart empty

            </div>

          )}

          {items.map(item => (

            <div
              key={item.id}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >

              <div className="mb-3 flex items-start justify-between">

                <div>

                  <div className="text-lg">

                    {
                      item.name
                    }

                  </div>

                  <div className="mt-1 text-xs uppercase text-white/40">

                    {
                      item.category ||
                      "MENU"
                    }

                  </div>

                </div>

                <div className="text-violet-300">

                  ฿{
                    Number(
                      item.price || 0
                    ).toFixed(0)
                  }

                </div>

              </div>

              <div className="flex items-center justify-between">

                <div className="flex items-center gap-2">

                  <button
                    onClick={() =>
                      onQuantityChange(
                        item.id,
                        -1
                      )
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5"
                  >

                    <Minus size={14} />

                  </button>

                  <div className="min-w-[24px] text-center">

                    {
                      item.quantity
                    }

                  </div>

                  <button
                    onClick={() =>
                      onQuantityChange(
                        item.id,
                        1
                      )
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5"
                  >

                    <Plus size={14} />

                  </button>

                </div>

                <div className="text-lg font-light">

                  ฿{
                    (
                      Number(
                        item.price || 0
                      ) *
                      Number(
                        item.quantity || 0
                      )
                    ).toFixed(0)
                  }

                </div>

              </div>

            </div>

          ))}

        </div>

      </div>

      {/* FOOTER */}

      <div className="shrink-0 border-t border-white/10 bg-[#12121A] pt-5">

        <div className="mb-5 flex items-center justify-between">

          <div className="text-white/50">

            TOTAL

          </div>

          <div className="text-3xl font-light text-violet-300">

            ฿{
              Number(
                total || 0
              ).toFixed(0)
            }

          </div>

        </div>

        <button
          onClick={onSendOrder}
          className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-violet-500 text-lg font-semibold text-black transition-all hover:bg-violet-400"
        >

          <Send size={18} />

          SEND ORDER

        </button>

      </div>

    </div>

  );

}
