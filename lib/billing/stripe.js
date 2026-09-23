// Stripe SDK ownership lives in the platform Service Provider layer.
// Billing code should import the governed StripeProvider facade instead of
// constructing a provider client or reading provider credentials directly.
export { StripeProvider } from "@/lib/platform/service-runtime/providers/stripe/StripeProvider";
