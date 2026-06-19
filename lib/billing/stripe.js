import Stripe from "stripe";

let stripeInstance = null;

export function getStripe() {
  if (stripeInstance) {
    return stripeInstance;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured"
    );
  }

  stripeInstance = new Stripe(
    process.env.STRIPE_SECRET_KEY,
    {
      apiVersion: "2024-06-20",
    }
  );

  return stripeInstance;
}
