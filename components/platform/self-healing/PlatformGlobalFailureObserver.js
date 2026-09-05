"use client";

import { useEffect } from "react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const sent = new Set();
const MAX_CLIENT_FINGERPRINTS = 250;

function text(value, limit = 400) {
  return String(value ?? "").trim().slice(0, limit);
}

function rejectionMessage(reason) {
  if (reason instanceof Error) return text(reason.message, 600);
  if (typeof reason === "string") return text(reason, 600);
  if (reason && typeof reason === "object") {
    return text(reason.message || reason.error || reason.name, 600);
  }
  return "Unhandled browser promise rejection";
}

function remember(key) {
  if (sent.has(key)) return false;
  sent.add(key);
  if (sent.size > MAX_CLIENT_FINGERPRINTS) {
    const oldest = sent.values().next().value;
    if (oldest) sent.delete(oldest);
  }
  return true;
}

function reportFailure({ organizationId, errorMessage, digest, action }) {
  const pathname = window.location.pathname || "/";
  const message = text(errorMessage, 600) || "Unhandled browser runtime error";
  const safeDigest = text(digest, 160) || null;
  const safeAction = text(action, 240) || null;
  const key = JSON.stringify([
    "runtime_exception",
    pathname,
    message,
    safeDigest,
    safeAction,
    organizationId || null,
  ]);

  if (!remember(key)) return;

  fetch("/api/platform/self-healing/capture", {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      category: "runtime_exception",
      pathname,
      errorMessage: message,
      digest: safeDigest,
      action: safeAction,
      organizationId: organizationId || null,
    }),
  }).catch(() => {
    sent.delete(key);
  });
}

export default function PlatformGlobalFailureObserver() {
  const businessContext = useBusinessContext();
  const organizationId = businessContext?.organization_id || null;

  useEffect(() => {
    function onWindowError(event) {
      const message = event?.error?.message || event?.message;
      if (!message) return;

      reportFailure({
        organizationId,
        errorMessage: message,
        digest: event?.error?.digest || null,
        action: "handle browser event",
      });
    }

    function onUnhandledRejection(event) {
      reportFailure({
        organizationId,
        errorMessage: rejectionMessage(event?.reason),
        digest: event?.reason?.digest || null,
        action: "settle browser promise",
      });
    }

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [organizationId]);

  return null;
}
