export default function POSCart({
  selectedTable,
  orderItems,
  total,
  sending,
  removeItem,
  sendOrder,
  clearTable,
  tableStatus,
  tableSessions,
}) {

  const session =
    tableSessions?.[
      selectedTable
    ];

  const status =
    tableStatus?.[
      selectedTable
    ] || "AVAILABLE";

  const duration =
    session
      ? Math.floor(
          (
            Date.now() -
            session.startedAt
          ) / 60000
        )
      : 0;

  const statusStyles = {
    AVAILABLE:
      "bg-green-500/10 text-green-400",

    ACTIVE:
      "bg-orange-500/10 text-orange-400",

    BILLING:
      "bg-blue-500/10 text-blue-400",

    WAITING:
      "bg-yellow-500/10 text-yellow-400",

    CLEANING:
      "bg-red-500/10 text-red-400",
  };

  return (
    <div className="flex h-full flex-col">

      {/* HEADER */}
      <div>

        <div className="flex items-start justify-between">

          <div>

            <div className="text-[11px] tracking-[0.3em] text-[#B58AF8]">
              ACTIVE TABLE
            </div>

            <div
              className="mt-2 text-3xl"
              style={{
                fontWeight: 250,
                letterSpacing: "-0.06em",
              }}
            >
              {selectedTable}
            </div>

          </div>

          <div
            className={`rounded-full px-4 py-2 text-[11px] tracking-[0.15em] ${
              statusStyles[
                status
              ]
            }`}
          >
            {status}
          </div>

        </div>

        {/* SESSION */}
        {session && (

          <div className="mt-5 grid grid-cols-3 gap-2">

            <div className="rounded-[14px] border border-white/10 bg-[#15151D] p-3">

              <div className="text-[10px] tracking-[0.18em] text-white/30">
                TIME
              </div>

              <div
                className="mt-2 text-lg"
                style={{
                  fontWeight: 250,
                }}
              >
                {duration}m
              </div>

            </div>

            <div className="rounded-[14px] border border-white/10 bg-[#15151D] p-3">

              <div className="text-[10px] tracking-[0.18em] text-white/30">
                ORDERS
              </div>

              <div
                className="mt-2 text-lg"
                style={{
                  fontWeight: 250,
                }}
              >
                {session.orders}
              </div>

            </div>

            <div className="rounded-[14px] border border-white/10 bg-[#15151D] p-3">

              <div className="text-[10px] tracking-[0.18em] text-white/30">
                REVENUE
              </div>

              <div
                className="mt-2 text-lg"
                style={{
                  fontWeight: 250,
                }}
              >
                ฿
                {session.revenue}
              </div>

            </div>

          </div>
        )}

      </div>

      {/* ITEMS */}
      <div className="mt-5 flex-1 space-y-3 overflow-y-auto pr-1">

        {orderItems.length === 0 && (

          <div className="flex h-full items-center justify-center rounded-[18px] border border-dashed border-white/10 bg-black/20 text-sm text-white/30">

            No items selected

          </div>
        )}

        {orderItems.map((item) => (

          <div
            key={item.dish_id}
            className="rounded-[18px] border border-white/10 bg-[#15151D] p-3"
          >

            <div className="flex items-start justify-between">

              <div>

                <div
                  className="text-base"
                  style={{
                    fontWeight: 300,
                    letterSpacing: "-0.03em",
                  }}
                >
                  {item.item_name}
                </div>

                <div className="mt-1 text-sm text-white/40">
                  Qty {item.quantity}
                </div>

              </div>

              <button
                onClick={() =>
                  removeItem(
                    item.dish_id
                  )
                }
                className="flex h-8 w-8 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10 text-lg text-red-400 transition hover:scale-105"
              >
                −
              </button>

            </div>

            <div className="mt-4 flex items-end justify-between">

              <div className="text-[10px] tracking-[0.18em] text-white/30">
                TOTAL
              </div>

              <div
                className="text-xl"
                style={{
                  fontWeight: 250,
                  letterSpacing: "-0.05em",
                }}
              >
                ฿
                {Number(
                  item.price || 0
                ) * item.quantity}
              </div>

            </div>

          </div>
        ))}

      </div>

      {/* FOOTER */}
      <div className="mt-5 border-t border-white/10 pt-5">

        <div className="mb-5 flex items-end justify-between">

          <div>

            <div className="text-[10px] tracking-[0.18em] text-white/30">
              ORDER TOTAL
            </div>

            <div
              className="mt-2 text-4xl"
              style={{
                fontWeight: 250,
                letterSpacing: "-0.07em",
              }}
            >
              ฿{total}
            </div>

          </div>

        </div>

        {/* ACTIONS */}
        <div className="space-y-3">

          <button
            onClick={sendOrder}
            disabled={
              orderItems.length === 0 ||
              sending
            }
            className="w-full rounded-[18px] bg-[#8B5CF6] px-5 py-4 text-lg font-medium text-white transition duration-300 hover:bg-[#9D6BFF] disabled:opacity-40"
          >
            {sending
              ? "SENDING..."
              : "SEND ORDER"}
          </button>

          <div className="grid grid-cols-3 gap-2">

            <button className="rounded-[16px] border border-white/10 bg-[#15151D] px-4 py-3 text-sm text-white/60 transition hover:bg-[#1A1A24]">
              HOLD
            </button>

            <button className="rounded-[16px] border border-white/10 bg-[#15151D] px-4 py-3 text-sm text-white/60 transition hover:bg-[#1A1A24]">
              ADJUST
            </button>

            <button
              onClick={clearTable}
              disabled={sending}
              className="rounded-[16px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 transition hover:bg-red-500/20 disabled:opacity-40"
            >
              CLEAR
            </button>

          </div>

        </div>

      </div>

    </div>
  );
}
