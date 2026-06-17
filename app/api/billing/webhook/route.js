import { NextResponse } from "next/server";
import { stripe } from "@/lib/billing/stripe";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(req) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Webhook Error" },
      { status: 400 }
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const { organizationId, plan } = session.metadata;

    await supabaseAdmin
      .from("organizations")
      .update({
        plan,
        subscription_status: "active",
      })
      .eq("id", organizationId);
  }

  return NextResponse.json({ received: true });
}
