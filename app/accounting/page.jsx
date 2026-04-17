"use client";

import { useEffect, useState } from "react";

export default function Accounting() {
  const [expenses, setExpenses] = useState([]);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({
    name: "",
    amount: "",
    category: "",
    image: null,
  });
  const [ocrText, setOcrText] = useState("");
  const [ocrStatus, setOcrStatus] = useState("");
  const [parsedPreview, setParsedPreview] = useState({
    name: "",
    amount: "",
  });

  useEffect(() => {
    const storedExpenses =
      JSON.parse(localStorage.getItem("expenses")) || [];
    const storedHistory =
      JSON.parse(localStorage.getItem("history")) || [];

    setExpenses(storedExpenses);
    setHistory(storedHistory);
  }, []);

  const totalExpenses = expenses.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );

  const totalRevenue = history.reduce(
    (sum, d) => sum + Number(d.revenue || 0),
    0
  );

  const netProfit = totalRevenue - totalExpenses;

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onloadend = () => {
      setForm((prev) => ({
        ...prev,
        image: reader.result,
      }));
      setOcrText("");
      setOcrStatus("");
      setParsedPreview({ name: "", amount: "" });
    };

    reader.readAsDataURL(file);
  };

  const cleanLine = (line) => {
    return line.replace(/\s+/g, " ").trim();
  };

  const normalizeAmount = (value) => {
    if (!value) return "";

    const cleaned = String(value)
      .replace(/บาท/g, "")
      .replace(/thb/gi, "")
      .replace(/[^\d.,-]/g, "")
      .trim();

    if (!cleaned) return "";

    // Handle values like 25,000 or 25,000.00
    if (cleaned.includes(",") && cleaned.includes(".")) {
      return cleaned.replace(/,/g, "");
    }

    // Handle values like 25,000
    if (cleaned.includes(",") && !cleaned.includes(".")) {
      return cleaned.replace(/,/g, "");
    }

    return cleaned;
  };

  const extractLargestAmountFromLine = (line) => {
    const matches = line.match(/\d[\d,]*\.?\d{0,2}/g);
    if (!matches) return "";

    let best = "";
    let bestValue = 0;

    matches.forEach((m) => {
      const normalized = normalizeAmount(m);
      const value = parseFloat(normalized);
      if (!Number.isNaN(value) && value > bestValue) {
        bestValue = value;
        best = normalized;
      }
    });

    return best;
  };

  const extractData = (text) => {
    const rawLines = text
      .split("\n")
      .map(cleanLine)
      .filter(Boolean);

    const lowerLines = rawLines.map((l) => l.toLowerCase());

    let name = "";
    let amount = "";

    // 1) Strong vendor detection for invoice-style documents
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const lower = lowerLines[i];

      if (
        lower.includes("invoice to:") ||
        lower.startsWith("invoice to")
      ) {
        const extracted = line.split(/invoice to:/i)[1]?.trim();
        if (extracted) {
          name = extracted;
          break;
        }
      }
    }

    // 2) Fallback vendor: first company-like line
    if (!name) {
      const badWords = [
        "invoice",
        "invoice date",
        "date:",
        "time:",
        "venue:",
        "event:",
        "details:",
        "payment terms",
        "description",
        "amount",
        "tax id",
        "bank",
        "account number",
        "phone",
        "email",
        "www.",
      ];

      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        const lower = lowerLines[i];

        const hasDigits = /\d/.test(line);
        const looksBad = badWords.some((w) => lower.includes(w));

        if (
          !hasDigits &&
          !looksBad &&
          line.length >= 4 &&
          line.length <= 60
        ) {
          name = line;
          break;
        }
      }
    }

    // 3) Amount priority:
    // Remaining Balance > Balance > Grand Total > Total > Amount > Fee > largest number
    const priorityKeywords = [
      "remaining balance",
      "balance",
      "grand total",
      "net total",
      "total",
      "amount",
      "performance fee",
      "fee",
      "deposit",
    ];

    for (const keyword of priorityKeywords) {
      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        const lower = lowerLines[i];

        if (lower.includes(keyword)) {
          const extracted = extractLargestAmountFromLine(line);
          if (extracted) {
            amount = extracted;
            break;
          }
        }
      }
      if (amount) break;
    }

    // 4) Table fallback: look for THB values anywhere
    if (!amount) {
      let best = "";
      let bestValue = 0;

      rawLines.forEach((line) => {
        const extracted = extractLargestAmountFromLine(line);
        if (!extracted) return;

        const value = parseFloat(extracted);
        if (!Number.isNaN(value) && value > bestValue) {
          bestValue = value;
          best = extracted;
        }
      });

      amount = best;
    }

    return {
      name: name || "",
      amount: amount || "",
    };
  };

  const runOCR = async () => {
    if (!form.image) {
      alert("Please upload an image first");
      return;
    }

    try {
      setOcrStatus("Reading receipt...");
      setOcrText("");
      setParsedPreview({ name: "", amount: "" });

      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: form.image }),
      });

      const data = await res.json();

      if (!res.ok) {
        setOcrStatus(`OCR failed: ${data.error || "Unknown error"}`);
        return;
      }

      if (!data.text || typeof data.text !== "string") {
        setOcrStatus("OCR returned no readable text");
        return;
      }

      setOcrText(data.text);

      const parsed = extractData(data.text);
      setParsedPreview(parsed);

      setForm((prev) => ({
        ...prev,
        name: parsed.name || prev.name,
        amount: parsed.amount || prev.amount,
      }));

      setOcrStatus("OCR finished");
    } catch (error) {
      setOcrStatus(`OCR error: ${error.message}`);
    }
  };

  const addExpense = () => {
    if (!form.name || !form.amount) {
      alert("Missing name or amount");
      return;
    }

    const newExpense = {
      ...form,
      amount: Number(normalizeAmount(form.amount)),
      date: new Date().toLocaleDateString("en-GB"),
    };

    const updated = [newExpense, ...expenses];

    localStorage.setItem("expenses", JSON.stringify(updated));
    setExpenses(updated);

    setForm({
      name: "",
      amount: "",
      category: "",
      image: null,
    });
    setOcrText("");
    setOcrStatus("");
    setParsedPreview({ name: "", amount: "" });
  };

  return (
    <div className="relative min-h-screen text-white overflow-hidden">
      <div className="absolute inset-0 -z-30">
        <img
          src="/bg-hero-control.jpg"
          alt="Accounting background"
          className="w-full h-full object-cover"
        />
      </div>

      <div className="absolute inset-0 -z-20 bg-[linear-gradient(to_bottom,rgba(8,8,8,0.75),rgba(18,12,8,0.85))]" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_70%_20%,rgba(255,140,0,0.15),transparent_40%)]" />

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-24 pb-16 space-y-8">
        <div>
          <h1 className="text-3xl md:text-5xl font-semibold">Accounting</h1>
          <p className="text-white/60 mt-2">
            Expenses: THB {totalExpenses.toLocaleString()} | Revenue: THB{" "}
            {totalRevenue.toLocaleString()} | Profit: THB{" "}
            {netProfit.toLocaleString()}
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6 space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <input
              placeholder="Vendor"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              className="p-3 rounded-xl bg-black/30 border border-white/10"
            />

            <input
              placeholder="Amount"
              value={form.amount}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, amount: e.target.value }))
              }
              className="p-3 rounded-xl bg-black/30 border border-white/10"
            />

            <input
              placeholder="Category"
              value={form.category}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, category: e.target.value }))
              }
              className="p-3 rounded-xl bg-black/30 border border-white/10"
            />
          </div>

          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="block"
          />

          {form.image && (
            <div className="space-y-3">
              <img
                src={form.image}
                alt="Uploaded receipt"
                className="w-48 rounded-xl border border-white/10"
              />

              <div className="flex gap-3">
                <button
                  onClick={runOCR}
                  className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-xl"
                >
                  Auto Read Receipt
                </button>

                <button
                  onClick={addExpense}
                  className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-xl"
                >
                  Add Expense
                </button>
              </div>
            </div>
          )}

          {ocrStatus && (
            <div className="text-sm text-white/70">
              {ocrStatus}
            </div>
          )}

          {(parsedPreview.name || parsedPreview.amount) && (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm text-white/50 mb-2">OCR Preview</div>
              <div>Name: {parsedPreview.name || "-"}</div>
              <div>Amount: {parsedPreview.amount || "-"}</div>
            </div>
          )}

          {ocrText && (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm text-white/50 mb-2">OCR Raw Text</div>
              <pre className="whitespace-pre-wrap text-xs text-white/80 overflow-auto max-h-80">
                {ocrText}
              </pre>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6">
          <h2 className="text-xl font-semibold mb-4">Expenses</h2>

          <div className="space-y-3">
            {expenses.map((item, i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <div className="font-semibold">{item.name}</div>
                <div>THB {Number(item.amount).toLocaleString()}</div>
                <div className="text-white/50">{item.category || "-"}</div>

                {item.image && (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-32 mt-3 rounded-lg border border-white/10"
                  />
                )}
              </div>
            ))}

            {expenses.length === 0 && (
              <div className="text-white/50">No expenses added yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}