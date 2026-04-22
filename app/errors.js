"use client";

export default function GlobalError({ error, reset }) {
  return (
    <div style={{
      height: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#000",
      color: "#fff",
      flexDirection: "column"
    }}>
      <h1>Something broke</h1>
      <p>{error?.message}</p>
      <button onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}