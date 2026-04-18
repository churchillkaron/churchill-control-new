"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function Accounting() {
  const [expenses, setExpenses] = useState([]);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({
    name: "",
    amount: "",
    category: "",
    image: null,
  });
  const [ocrStatus, setOcrStatus] = useState("");
  const [parsedPreview, setParsedPreview] = useState({
    name: "",
    amount: "",
  });

  useEffect(() => {
    loadData();

    const handleStorageChange = () => {
      loadData();
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const loadData = () => {
    const storedExpenses =
      JSON.parse(localStorage.getItem("expenses")) || [];
    const storedHistory =
      JSON.parse(localStorage.getItem("history")) || [];

    setExpenses(storedExpenses);
    setHistory(storedHistory);
  };

  // 🔥 FINANCIAL CALCULATIONS (FIXED ONLY THIS PART)
  const totalExpenses = expenses.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );

  const totalRevenue = history.reduce(
    (sum, d) => sum + Number(d.total || 0), // ✅ FIXED
    0
  );

  const totalServiceCharge = history.reduce(
    (sum, d) => sum + Number(d.serviceCharge || 0), // ✅ SAFE ADD
    0
  );

  const netProfit = totalRevenue - totalExpenses;

  const profitMargin =
    totalRevenue > 0
      ? Math.round((netProfit / totalRevenue) * 100)
      : 0;

  // 🔥 CATEGORY BREAKDOWN (UNCHANGED)
  const categoryMap = {};
  expenses.forEach((e) => {
    const key = e.category || "Other";
    if (!categoryMap[key]) categoryMap[key] = 0;
    categoryMap[key] += Number(e.amount || 0);
  });

  // 🔥 OCR (UNTOUCHED)
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onloadend = () => {
      setForm((prev) => ({
        ...prev,
        image: reader.result,
      }));
      setOcrStatus("");
      setParsedPreview({ name: "", amount: "" });
    };

    reader.readAsDataURL(file);
  };

  const runOCR = async () => {
    if (!form.image) {
      alert("Upload receipt first");
      return;
    }

    try {
      setOcrStatus("Reading receipt...");

      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: form.image }),
      });

      const data = await res.json();

      if (!data?.data) {
        setOcrStatus("OCR failed");
        return;
      }

      const parsed = {
        name: data.data.vendor || "",
        amount: data.data.total_amount || "",
      };

      setParsedPreview(parsed);

      setForm((prev) => ({
        ...prev,
        name: parsed.name || prev.name,
        amount: parsed.amount || prev.amount,
      }));

      setOcrStatus("OCR complete");
    } catch (err) {
      setOcrStatus("OCR error");
    }
  };

  const normalizeAmount = (value) => {
    if (!value) return "";

    return String(value)
      .replace(/[^\d.-]/g, "")
      .replace(/,/g, "");
  };

  const addExpense = () => {
    if (!form.name || !form.amount) {
      alert("Missing data");
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

    setParsedPreview({ name: "", amount: "" });
    setOcrStatus("");
  };

  const deleteExpense = (index) => {
    const updated = expenses.filter((_, i) => i !== index);
    localStorage.setItem("expenses", JSON.stringify(updated));
    setExpenses(updated);
  };

  return (
    <AppShell>
      <div className="space-y-14">

        <div>
          <h1 className="text-3xl text-white/90">Accounting</h1>
          <p className="text-white/50 text-sm">
            Financial control and expense management
          </p>
        </div>

        {/* HERO */}
        <div className="grid md:grid-cols-5 gap-6">

          <Card label="Revenue" value={`THB ${totalRevenue.toLocaleString()}`} />
          <Card label="Expenses" value={`THB ${totalExpenses.toLocaleString()}`} />
          <Card label="Profit" value={`THB ${netProfit.toLocaleString()}`} highlight />
          <Card label="Margin" value={`${profitMargin}%`} />
          <Card label="Service" value={`THB ${totalServiceCharge.toLocaleString()}`} />

        </div>

        {/* rest unchanged */}