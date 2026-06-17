const { createClient } = require("@supabase/supabase-js");
const ws = require("ws");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    realtime: {
      transport: ws,
    },
  }
);

const tables = [
  "hotel_properties",
  "hotel_rooms",
  "hotel_bookings",
  "hotel_guests",
  "hotel_housekeeping_tasks",
  "hotel_maintenance_tasks",
  "hotel_concierge_requests",
];

(async () => {
  for (const table of tables) {
    try {
      const { error } = await supabase
        .from(table)
        .select("*")
        .limit(1);

      console.log(
        "TABLE:",
        table,
        error ? "MISSING" : "EXISTS"
      );
    } catch (e) {
      console.log(
        "TABLE:",
        table,
        "ERROR:",
        e.message
      );
    }
  }
})();
