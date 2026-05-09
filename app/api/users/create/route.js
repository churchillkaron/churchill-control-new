import { NextResponse }
from "next/server";

import { supabase }
from "@/lib/supabase";



function generatePassword() {
return Math.random().toString(36).slice(-8);
}

export async function POST(req) {
try {
const body = await req.json();
const { name, email, role, position, tenant_id } = body;

```
// 🔴 Basic validation
if (!name || !email || !role || !tenant_id) {
  return Response.json(
    { error: "Missing required fields" },
    { status: 400 }
  );
}

const password = generatePassword();

// ✅ 1. Create user (NO EMAIL SYSTEM)
const { data, error: createError } =
  await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

if (createError) {
  console.log("CREATE USER ERROR:", createError);
  return Response.json(
    { error: createError.message },
    { status: 400 }
  );
}

// ✅ 2. Insert into staff_accounts
const { error: insertError } = await supabase
  .from("staff_accounts")
  .insert([
    {
      auth_user_id: data.user.id,
      name,
      email,
      role,
      position,
      tenant_id,
      active: true,
    },
  ]);

if (insertError) {
  console.log("DB INSERT ERROR:", insertError);
  return Response.json(
    { error: insertError.message },
    { status: 400 }
  );
}

// ✅ 3. Return credentials (CRITICAL for frontend + CSV)
return Response.json({
  success: true,
  email,
  password,
});
```

} catch (err) {
console.log("SERVER ERROR:", err);
return Response.json(
{ error: "Server error" },
{ status: 500 }
);
}
}
