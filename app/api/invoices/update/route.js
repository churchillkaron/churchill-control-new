import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Supabase connection
const supabase = createClient(
process.env.SUPABASE_URL,
process.env.SUPABASE_SERVICE_ROLE_KEY
);

// =========================
// UPDATE INVOICE STATUS
// =========================
export async function POST(req) {
try {
const body = await req.json();
const { id, status } = body;

```
if (!id || !status) {
  return NextResponse.json(
    { error: "Missing id or status" },
    { status: 400 }
  );
}

const { data, error } = await supabase
  .from("invoices")
  .update({
    status: status,
    updated_at: new Date().toISOString(),
  })
  .eq("id", id)
  .select()
  .single();

if (error) {
  console.error("UPDATE ERROR:", error);
  return NextResponse.json(
    { error: error.message },
    { status: 500 }
  );
}

return NextResponse.json({
  success: true,
  invoice: data,
});
```

} catch (err) {
console.error("SERVER ERROR:", err);
return NextResponse.json(
{ error: err.message },
{ status: 500 }
);
}
}
