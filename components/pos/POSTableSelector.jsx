export default function POSTableSelector({
  selectedTable,
  setSelectedTable,
  tableStatus,
  tableSessions,
}) {

  const tables = [
    "T1",
    "T2",
    "T3",
    "T4",
    "T5",
    "T6",
  ];

  const statusStyles = {
    AVAILABLE: {
      dot: "bg-green-400 shadow-[0_0_20px_rgba(74,222,128,0.7)]",
      text: "text-green-400",
    },

    ACTIVE: {
      dot: "bg-orange-400 shadow-[0_0_20px_rgba(251,146,60,0.7)]",
      text: "text-orange-400",
    },

    BILLING: {
      dot: "bg-blue-400 shadow-[0_0_20px_rgba(96,165,250,0.7)]",
      text: "text-blue-400",
    },

    WAITING: {
      dot: "bg-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.7)]",
      text: "text-yellow-400",
    },

    CLEANING: {
      dot: "bg-red-400 shadow-[0_0_20px_rgba(248,113,113,0.7)]",
      text: "text-red-400",
    },
  };

  return (
    <div className="grid grid-cols-2 gap-[10px]">

      {tables.map((table) => {

        const active =
          selectedTable ===
          table;

        const status =
          tableStatus?.[table] ||
          "AVAILABLE";

        const session =
          tableSessions?.[table];

        const duration =
          session
            ? Math.floor(
                (
                  Date.now() -
                  session.startedAt
                ) / 60000
              )
            : 0;

        return (
          <button
            key={table}
            onClick={() =>
              setSelectedTable(
                table
              )
            }
            className={`group relative min-h-[145px] overflow-hidden rounded-[16px] border p-3 text-left transition-all duration-300 ${
              active
                ? "border-[#8B5CF6]/40 bg-gradient-to-br from-[#8B5CF6]/20 to-[#8B5CF6]/5 shadow-[0_0_35px_rgba(139,92,246,0.15)]"
                : "border-white/10 bg-[#111117] hover:border-white/20 hover:bg-[#15151D]"
            }`}
          >

            {/* BACKGROUND GLOW */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />

            <div className="relative z-10 flex h-full flex-col justify-between">

              {/* TOP */}
              <div>

                <div className="flex items-start justify-between">

                  <div className="text-[10px] tracking-[0.3em] text-white/25">
                    TABLE
                  </div>

                  <div
                    className={`h-2.5 w-2.5 rounded-full ${
                      statusStyles[
                        status
                      ]?.dot
                    }`}
                  />

                </div>

                <div
                  className="mt-2 text-[30px] leading-none text-white"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.06em",
                  }}
                >
                  {table}
                </div>

              </div>

              {/* BOTTOM */}
              <div>

                <div
                  className={`text-[11px] tracking-[0.18em] ${
                    statusStyles[
                      status
                    ]?.text
                  }`}
                >
                  {status}
                </div>

                {session && (

                  <div className="mt-2 flex items-center justify-between text-[11px] text-white/35">

                    <div>
                      {duration} MIN
                    </div>

                    <div>
                      ฿
                      {session.revenue || 0}
                    </div>

                  </div>
                )}

              </div>

            </div>

          </button>
        );
      })}

    </div>
  );
}
