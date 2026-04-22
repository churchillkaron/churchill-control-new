import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  try {
    const { userId, email } = await req.json();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      customer_email: email,

      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "AI Creative Studio Pro",
            },
            unit_amount: 2000, // $20/month
            recurring: {
              interval: "month",
            },
          },
          quantity: 1,
        },
      ],

      success_url: `${process.env.NEXT_PUBLIC_URL}/success?user=${userId}`,
      cancel_url: `${process.env.NEXT_PUBLIC_URL}/dashboard`,
    });

    return Response.json({ url: session.url });

  } catch (err) {
    console.error(err);
    return Response.json({ error: "Stripe error" });
  }
}