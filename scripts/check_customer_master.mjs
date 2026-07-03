import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = fs.readFileSync(".env.local", "utf8");

function get(name) {
  const m = env.match(new RegExp(`^${name}=(.*)$`, "m"));
  return m ? m[1].trim() : "";
}

const supabase = createClient(
  get("NEXT_PUBLIC_SUPABASE_URL"),
  get("SUPABASE_SERVICE_ROLE_KEY") || get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
);

const { count, error } = await supabase
  .from("customer_loyalty_accounts")
  .select("*", { head: true, count: "exact" });

console.log("Count:", count);
console.log("Error:", error);

const { data, error: e2 } = await supabase
  .from("customer_loyalty_accounts")
  .select("*")
  .limit(5);

console.log("Rows:");
console.log(JSON.stringify(data, null, 2));
console.log("Select error:", e2);
