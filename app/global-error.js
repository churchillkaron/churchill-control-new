"use client";

export default function GlobalError({ error, reset }) {
  return (
    <html>
      <body style={{ padding: 40 }}>
        <h2>Critical error</h2>
        <button onClick={() => reset()}>Reload</button>
      </body>
    </html>
  );
}