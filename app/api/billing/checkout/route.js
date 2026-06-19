import { NextResponse } from "next/server";
import { getStripe } from "@/lib/billing/stripe";
import { PLANS } from "@/lib/billing/plans";

export async function POST(req) {
  try {
    const { plan, organizationId } = await req.json();

    if (!PLANS[plan]) {
      return NextResponse.json(
        { success: false, error: "Invalid plan" },
        { status: 400 }
      );
    }

    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price: PLANS[plan].priceId,
          quantity: 1,
        },
      ],
      metadata: {
        organizationId,
        plan,
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing/success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing/cancel`,
    });

    return NextResponse.json({
      success: true,
      url: session.url,
    });

  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 }
    );
  }
}
