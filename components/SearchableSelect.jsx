"use client";

import { useState, useRef, useEffect } from "react";

export default function SearchableSelect({
  options = [],
  value,
  onChange,
  placeholder = "Select...",
  style = {},
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef();

  const filtered = options.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    function handleClick(e) {
      if (!ref.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      {/* INPUT */}
      <input
        value={open ? search : value || ""}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setSearch("");
        }}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: "100%",
          padding: "10px",
          borderRadius: 8,
          border: "1px solid #333",
          background: "#111",
          color: "white",
        }}
      />

      {/* DROPDOWN */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "#111",
            border: "1px solid #333",
            borderRadius: 8,
            marginTop: 4,
            maxHeight: 220,
            overflowY: "auto",
            zIndex: 999,
          }}
        >
          {filtered.length === 0 && (
            <div style={{ padding: 10, color: "#777" }}>
              No results
            </div>
          )}

          {filtered.map((option) => (
            <div
              key={option}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              style={{
                padding: 10,
                cursor: "pointer",
                borderBottom: "1px solid #222",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#222")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              {option}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}