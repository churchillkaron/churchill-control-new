"use client";

import PlatformFailureCaptureBeacon from "@/components/platform/self-healing/PlatformFailureCaptureBeacon";

export default function GlobalError({ error, reset }) {
  return (
    <html>
      <body style={{ padding: 40 }}>
        <PlatformFailureCaptureBeacon
          category="runtime_exception"
          errorMessage={error?.message || "Critical application error"}
          digest={error?.digest || null}
          action="render application shell"
        />
        <h2>Critical error</h2>
        <button onClick={() => reset()}>Reload</button>
      </body>
    </html>
  );
}
