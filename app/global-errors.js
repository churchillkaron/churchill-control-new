"use client";

export default function GlobalError({ error, reset }) {
  return (
    <html>
      <body style={{
        background: "#000",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        flexDirection: "column"
      }}>
        <h1>Global Crash</h1>
        <p>{error?.message}</p>
        <button onClick={() => reset()}>Retry</button>
      </body>
    </html>
  );
}