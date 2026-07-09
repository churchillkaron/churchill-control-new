export function trackUsage(module, context) {
  if (process.env.NODE_ENV !== "production") console.log("[ARCH TRACK]", module, context);
}
