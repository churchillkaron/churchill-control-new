"use client";

export default function GlobalError({ error, reset }) {
  console.error("GLOBAL ERROR:", error);

  return (
    <html>
      <body style={{ background: "black", color: "white", padding: 40 }}>
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
      </body>
    </html>
  );
}