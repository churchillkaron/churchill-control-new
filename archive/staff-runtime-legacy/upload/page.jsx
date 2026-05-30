"use client";

export const dynamic = "force-dynamic";

import { useMemo, useRef, useState, useEffect } from "react";

const CATEGORY_CONFIG = {
  routine: {
    title: "Routine Check",
    subtitle: "Closing, opening, cleaning, shift routine",
    accent: "bg-blue-500/20 border-blue-400/30 text-blue-200",
    button: "bg-blue-500 hover:bg-blue-600 text-white",
  },
  food: {
    title: "Food Quality",
    subtitle: "Food plating, dishes served, kitchen quality",
    accent: "bg-green-500/20 border-green-400/30 text-green-200",
    button: "bg-green-500 hover:bg-green-600 text-white",
  },
  marketing: {
    title: "Marketing Content",
    subtitle: "Nice atmosphere, drinks, people, special moments",
    accent: "bg-pink-500/20 border-pink-400/30 text-pink-200",
    button: "bg-pink-500 hover:bg-pink-600 text-white",
  },
  invoice: {
    title: "Invoice / Receipt",
    subtitle: "Supplier bill, cash receipt, delivery invoice",
    accent: "bg-orange-500/20 border-orange-400/30 text-orange-200",
    button: "bg-[#ff7a00] hover:bg-orange-600 text-black",
  },
};

const DEPARTMENTS = [
  { value: "kitchen", label: "Kitchen" },
  { value: "foh", label: "FOH" },
  { value: "bar", label: "Bar" },
];

function createSafeFileName(file) {
  const originalName = file?.name || "upload.jpg";
  const extensionFromName = originalName.includes(".")
    ? originalName.split(".").pop()
    : "jpg";

  const extension =
    String(extensionFromName || "jpg")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "jpg";

  return `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
}

function normalizeInvoiceData(ocrData) {
  const parsed = ocrData?.data || ocrData?.invoice || ocrData?.result || {};

  return {
    vendor:
      parsed.vendor ||
      parsed.supplier ||
      parsed.vendor_name ||
      parsed.store ||
      "Unknown vendor",

    date:
      parsed.date ||
      parsed.invoice_date ||
      parsed.receipt_date ||
      new Date().toISOString().slice(0, 10),

    total_amount:
      Number(
        parsed.total_amount ||
          parsed.total ||
          parsed.grand_total ||
          parsed.amount ||
          0
      ) || 0,

    items: Array.isArray(parsed.items)
      ? parsed.items.map((item) => ({
          name_thai: item.name_thai || item.thai_name || "",
          name_english:
            item.name_english ||
            item.name ||
            item.english_name ||
            item.description ||
            "Unknown item",
          qty: Number(item.qty || item.quantity || 1) || 1,
          unit_price: Number(item.unit_price || item.price || 0) || 0,
          total_price:
            Number(item.total_price || item.total || item.amount || 0) || 0,
          account_type: item.account_type || "Operating Expense",
          department: item.department || "Operations",
          natural_account: item.natural_account || "Unclassified",
        }))
      : [],
  };
}

export default function StaffUploadPage() {
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [category, setCategory] = useState("");
  const [department, setDepartment] = useState("kitchen");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [shiftActive, setShiftActive] = useState(false);
  const [currentShift, setCurrentShift] = useState(null);
  const [payrollLocked, setPayrollLocked] = useState(false);

  useEffect(() => {
    const shift = JSON.parse(localStorage.getItem("shift") || "null");
    const locked = localStorage.getItem("payroll_locked") === "true";

    setPayrollLocked(locked);

    if (shift?.active) {
      setShiftActive(true);
      setCurrentShift(shift);

      if (shift.department) {
        setDepartment(shift.department.toLowerCase());
      }
    }
  }, []);

  const previewUrl = useMemo(() => {
    if (!file) return "";
    return URL.createObjectURL(file);
  }, [file]);

  const selectedConfig = category ? CATEGORY_CONFIG[category] : null;

  const handleCategorySelect = (selectedCategory) => {
    const shift = JSON.parse(localStorage.getItem("shift") || "null");

    if (payrollLocked) {
      setMessage("❌ Payroll is locked. Uploads are disabled.");
      return;
    }

    if (!shiftActive) {
      setMessage("❌ You must start your shift before uploading");
      return;
    }

    if (
      selectedCategory === "food" &&
      shift?.department?.toLowerCase() !== "kitchen"
    ) {
      setMessage("❌ Only kitchen staff can upload food");
      return;
    }

    setCategory(selectedCategory);
    setMessage("");
    setFile(null);
    setNote("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];

    if (!selected) return;

    if (!selected.type?.startsWith("image/")) {
      setMessage("❌ Please choose an image file");
      return;
    }

    setFile(selected);
    setMessage("");
  };

  const handleUpload = async () => {
    const shift = JSON.parse(localStorage.getItem("shift") || "null");
    const locked = localStorage.getItem("payroll_locked") === "true";

    if (locked) {
      setMessage("❌ Payroll is locked. Uploads are disabled.");
      return;
    }

    if (!shiftActive || !shift?.active) {
      setMessage("❌ Start your shift before uploading");
      return;
    }

    if (!category) {
      setMessage("❌ Please choose what you are uploading");
      return;
    }

    if (!file) {
      setMessage("❌ Please take or select a photo first");
      return;
    }

    setLoading(true);
    setMessage("Uploading...");

    if (!shift?.user_id) {
      setMessage("❌ User not identified. Restart shift.");
      setLoading(false);
      return;
    }

    try {
  const safeFileName = createSafeFileName(file);

  const formData = new FormData();
  formData.append("file", file, safeFileName);

  const uploadRes = await fetch("/api/assets/upload-file", {
    method: "POST",
    body: formData,
  });

  let uploadData = null;

  try {
    uploadData = await uploadRes.json();
  } catch {
    throw new Error("Upload server returned invalid response");
  }

  if (!uploadRes.ok || !uploadData.success || !uploadData.url) {
    throw new Error(uploadData?.error || "File upload failed");
  }

  let invoiceWasCreated = false;

  // ✅ INVOICE FLOW (clean + safe)
  if (category === "invoice") {
    setMessage("Reading invoice...");

    const imageUrl = uploadData.url;

    if (!imageUrl || typeof imageUrl !== "string") {
      throw new Error("Invalid image URL for OCR");
    }

    const ocrRes = await fetch("/api/invoices/ocr", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    image: uploadData.url,
  }),
});

    let ocrData = null;

    try {
      ocrData = await ocrRes.json();
    } catch {
      throw new Error("OCR server returned invalid response");
    }

    if (!ocrRes.ok || !ocrData.success) {
      throw new Error(ocrData?.error || "OCR failed");
    }

    setMessage("Invoice sent to manager approval");
    invoiceWasCreated = true;
  }

  // ✅ ASSET SAVE (unchanged logic, safer validation)
  const saveRes = await fetch("/api/assets/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: uploadData.url,
      note,
      category,
      department,
      status: "pending",
      uploaded_by: shift.name || "staff",
      uploaded_by_id: shift.user_id,
      source: "staff",
      type: category === "invoice" ? "invoice" : "photo",
      invoice_status: invoiceWasCreated ? "pending_manager" : null,
    }),
  });

  let saveData = null;

  try {
    saveData = await saveRes.json();
  } catch {
    throw new Error("Save server returned invalid response");
  }

  if (!saveRes.ok || !saveData.success) {
    throw new Error(saveData?.error || "Save failed");
  }

  const existingTasks = JSON.parse(localStorage.getItem("tasks") || "{}");

  const updatedTasks = {
    routine: false,
    food: false,
    marketing: false,
    invoice: false,
    ...existingTasks,
    [category]: true,
  };

  localStorage.setItem("tasks", JSON.stringify(updatedTasks));

  setFile(null);
  setCategory("");
  setDepartment(shift.department?.toLowerCase() || "kitchen");
  setNote("");

  if (fileInputRef.current) {
    fileInputRef.current.value = "";
  }

  setMessage(
    category === "invoice"
      ? "✅ Invoice uploaded and sent to manager approval"
      : "✅ Uploaded successfully"
  );

  setTimeout(() => {
    window.location.href = "/staff";
  }, 1200);

} catch (err) {
  setMessage(`❌ ${err.message || "Something went wrong"}`);
} finally {
  setLoading(false);
}
  };

  return (
    <div className="min-h-screen bg-black text-white px-4 py-6">
      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Upload Photo / Bill</h1>
          <p className="text-white/50 text-sm mt-1">
            One place for routine checks, food photos, marketing content, and
            invoices
          </p>
        </div>

        {payrollLocked && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            Payroll is locked. Uploads are disabled for this payroll period.
          </div>
        )}

        {!shiftActive && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            You must start your shift before uploading.
          </div>
        )}

        {shiftActive && currentShift?.name && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/50">
            Logged shift: {currentShift.name} /{" "}
            {currentShift.department || department}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
            const isActive = category === key;

            return (
              <button
                key={key}
                type="button"
                onClick={() => handleCategorySelect(key)}
                disabled={payrollLocked}
                className={`rounded-2xl border p-4 text-left transition ${
                  payrollLocked
                    ? "bg-white/5 border-white/10 text-white/25 cursor-not-allowed"
                    : isActive
                    ? `${config.accent} ring-2 ring-white/30`
                    : "bg-white/5 border-white/10 hover:bg-white/10 text-white"
                }`}
              >
                <div className="font-medium">{config.title}</div>
                <div className="text-xs mt-1 opacity-80">
                  {config.subtitle}
                </div>
              </button>
            );
          })}
        </div>

        {category && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
            <div>
              <div className="text-sm text-white/60">Selected Type</div>
              <div className="text-lg font-medium mt-1">
                {selectedConfig?.title}
              </div>
            </div>

            <div>
              <label className="text-sm text-white/60 block mb-2">
                Department
              </label>
              <div className="grid grid-cols-3 gap-2">
                {DEPARTMENTS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setDepartment(item.value)}
                    disabled={payrollLocked}
                    className={`rounded-xl px-3 py-2 text-sm border transition ${
                      department === item.value
                        ? "bg-[#ff7a00] text-black border-[#ff7a00]"
                        : "bg-black/30 text-white border-white/10"
                    } ${payrollLocked ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {!file && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={payrollLocked}
                className={`w-full rounded-xl px-4 py-3 font-medium transition disabled:opacity-50 ${selectedConfig?.button}`}
              >
                Take / Choose Photo
              </button>
            )}

            {file && (
              <div className="space-y-4">
                <div className="rounded-2xl overflow-hidden bg-white/10">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full max-h-[420px] object-cover"
                  />
                </div>

                <div className="text-sm text-white/60 break-all">
                  {file.name}
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={payrollLocked}
                  className="w-full rounded-xl px-4 py-3 bg-white/10 hover:bg-white/15 transition disabled:opacity-50"
                >
                  Change Photo
                </button>
              </div>
            )}

            <div>
              <label className="text-sm text-white/60 block mb-2">
                Note{" "}
                {category === "invoice"
                  ? "(supplier / item / detail)"
                  : "(optional)"}
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={payrollLocked}
                placeholder={
                  category === "invoice"
                    ? "Example: vegetables supplier, cash paid by staff"
                    : "Add any useful note..."
                }
                className="w-full rounded-2xl bg-black/30 border border-white/10 p-3 min-h-[120px] outline-none disabled:opacity-40"
              />
            </div>

            <button
              type="button"
              onClick={handleUpload}
              disabled={loading || payrollLocked}
              className={`w-full rounded-xl px-4 py-3 font-medium transition disabled:opacity-50 ${selectedConfig?.button}`}
            >
              {loading ? "Uploading..." : "Submit"}
            </button>
          </div>
        )}

        {message && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}