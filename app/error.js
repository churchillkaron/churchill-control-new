"use client";

import PlatformFailureCaptureBeacon from "@/components/platform/self-healing/PlatformFailureCaptureBeacon";

export default function ErrorBoundary({ error, reset }) {
  console.error("GLOBAL ERROR:", error);

  return (
    <div style={{ background: "black", color: "white", minHeight: "100vh", padding: 40 }}>
      <PlatformFailureCaptureBeacon
        category="runtime_exception"
        errorMessage={error?.message || "Unknown error"}
        digest={error?.digest || null}
        action="render application route"
      />
      <h1>App Error</h1>

      <pre style={{ whiteSpace: "pre-wrap", color: "red" }}>
        {error?.message || "Unknown error"}
      </pre>

      <button
        onClick={() => reset()}
        style={{
          marginTop: 20,
          padding: 10,
          background: "orange",
          border: "none",
        }}
      >
        Try again
      </button>
    </div>
  );
}
