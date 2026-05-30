export default function POSTableSelector({
  selectedTable,
  setSelectedTable,
  tableStatus,
  tableSessions,
}) {
  return (
    <div className="grid grid-cols-2 gap-2">

      {[
        "T1",
        "T2",
        "T3",
        "T4",
        "T5",
        "T6",
      ].map((table) => {

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
        ) /
          60000
      )
    : 0;

    let urgency =
  "NORMAL";

if (duration >= 45) {
  urgency = "CRITICAL";
} else if (
  duration >= 25
) {
  urgency = "WARNING";
}

const statusStyles = {

  
  AVAILABLE:
    "bg-green-400 shadow-[0_0_20px_rgba(74,222,128,0.8)]",

  ACTIVE:
    "bg-orange-400 shadow-[0_0_20px_rgba(251,146,60,0.8)]",

  WAITING:
    "bg-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.8)]",

  BILLING:
    "bg-blue-400 shadow-[0_0_20px_rgba(96,165,250,0.8)]",

  CLEANING:
    "bg-red-400 shadow-[0_0_20px_rgba(248,113,113,0.8)]",
};

const urgencyGlow = {
  NORMAL:
    "",

  WARNING:
    "shadow-[0_0_30px_rgba(250,204,21,0.18)]",

  CRITICAL:
    "shadow-[0_0_35px_rgba(248,113,113,0.22)]",
};

        return (
          <button
            key={table}
            onClick={() =>
              setSelectedTable(
                table
              )
            }
            className={`group relative overflow-hidden rounded-[20px] border p-4 text-left transition-all duration-300 ${
  urgencyGlow[
    urgency
  ]
} ${
  active
    ? "border-[#8B5CF6]/40 bg-gradient-to-br from-[#8B5CF6]/20 to-[#8B5CF6]/5"
    : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
}`}
          >

            {/* GLOW */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#8B5CF6]/10 via-transparent to-[#D6A66A]/10 opacity-0 transition duration-500 group-hover:opacity-100" />

            <div className="relative z-10">

              <div className="flex items-start justify-between">

                <div>

                  <div className="text-[10px] tracking-[0.25em] text-white/30">
                    TABLE
                  </div>

                  <div
                    className="mt-2 text-2xl"
                    style={{
                      fontWeight: 250,
                      letterSpacing: "-0.05em",
                    }}
                  >
                    {table}
                  </div>

                </div>

                <div
                  className={`h-3 w-3 rounded-full ${
  statusStyles[
    status
  ]
}`}
                />

              </div>

              <div className="mt-5">

  <div className="flex items-center justify-between">

    <div className="text-xs text-white/40">
      {status}
    </div>

    {session && (

  <div
    className={`text-xs ${
      urgency ===
      "CRITICAL"
        ? "text-red-400"
        : urgency ===
          "WARNING"
        ? "text-yellow-400"
        : "text-white/30"
    }`}
  >
    {duration}m
  </div>
)}

  </div>

  {session && (

    <div className="mt-3 flex items-center justify-between text-xs text-white/35">

      <div>
        {session.guests} guests
      </div>

      <div>
  ฿
  {session.revenue}
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
